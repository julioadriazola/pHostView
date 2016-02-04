var child_process = require('child_process'),
    path = require("path"),
    fs = require('fs'),
    mkdirp = require('mkdirp');

module.exports = {


    processOneFile: function(){
        /*
         * processOneFile will be called again by endProcess function
         */
        DB.nextFileToProcess(function(err,file){
            if(err) return sails.log.error("There's some error: " + err);
            FileProcessor.decompressZIP(file);
        });
    },

    decompressZIP: function(upload){
        var ofn = process.cwd() + upload.file_path; //Original file name
        var fn = ofn;

        /*
         * Create a tmp folder to process the file
         */
        upload.tmp_folder = path.dirname(fn) + '/.' + path.basename(fn).replace(/\./g,'')
        var tmpfn =  upload.tmp_folder + '/' + path.basename(fn);
        mkdirp(path.dirname(tmpfn),function(err){
            if (err) {
                upload.status = 'waitingFile';
                upload.error_info = 'Failed to create ' + upload.tmp_folder + ' temp folder: ' + err;
                return FileProcessor.endProcess(null,upload);
            }
            if(!fs.existsSync(fn)) {
                upload.status = 'waitingFile';
                upload.error_info = fn + ' file was not found or is been used';
                return FileProcessor.endProcess(null,upload);
            }

            fs.rename(fn,tmpfn);
            fn= tmpfn;

            child_process.exec(
                "dtrx -q -f " + fn,
                { cwd: path.dirname(fn)},
                function(err,stdout,stderr){
                    fs.rename(tmpfn,ofn);

                    if(err){
                        upload.status = 'waitingFile';
                        upload.error_info = 'decompressZIP task failed with file: ' + fn;
                        return FileProcessor.endProcess(null,upload);
                    }

                    unzipped = path.dirname(fn) + "/" + path.basename(fn).replace('.zip','');
                    if(!fs.existsSync(unzipped)){
                        
                        /*
                         * Older versions convention is that a <file_name>.zip must have 
                         * a submit/<file_name> file inside.
                         */
                        unzipped = path.dirname(fn) + "/submit/" + path.basename(fn).replace('.zip','');
                        if(!fs.existsSync(unzipped)){
                            upload.status = 'waitingFile';
                            upload.error_info = '[submit/]' + path.basename(fn).replace('.zip','') + ' unzipped file was not found from file: ' + fn
                        }
                    }

                    upload.unzipped = unzipped;
                    if(unzipped.indexOf(".pcap") > -1){
                        // FileProcessor.processPCAP(null);
                    }
                    else if(unzipped.indexOf("info") > -1){
                        // FileProcessor.processInfo(null);
                    }
                    else if(unzipped.indexOf(".db") > -1){
                        
                        SQLiteProcessor.process(upload);
                    }
                    else if(unzipped.indexOf(".log") > -1){
                        
                        // FileProcessor.processDB(upload);
                    }
                    else{
                        SurveyProcessor.process(upload);  
                    }

                }
            )//child_process
        })//mkdir tmp folder
    },

    endProcess: function(err,file){
        /*
         * List of status:
         * errored: means that the file has an unappropiated format or doesn't contains information.
         *
         * waitingFile: means that there was a problem with the zipped file (it doesn't exists, 
         * it's being used for another process, it's not possible to find file inside [the unzipped one],
         * etc.). Files with this status can be processed later.
         *
         * processed: means that the file was processed succesfully without problems.
         *
         * processing: means that the file is being processed. It can't be processed for more than one thread.
         * If there is some file with an "eternal" processing status, it means that some problem
         * arised and was not catched.
         */

        if(file.status == 'waitingFile'){
            sails.log.warn("File with id: " + file.id + " was marked as waitingFile.");
            if(file.error_info) sails.log.warn(file.error_info)
        }
        else if(err) {
            file.status = "errored";
            sails.log.error("There was some problem processing the file with id: " + file.id);
            sails.log.error(err);
        }
        else{
            file.status = "processed";
            sails.log.info("File with id: " + file.id + " was processed successfully");
        }

        if(file.tmp_folder){
            child_process.exec(
                "rm -r " + file.tmp_folder,
                { cwd: path.dirname(file.tmp_folder)},
                function(err,stdout){
                    if(err) sails.log.error('Impossible to execute "rm -r ' + file.tmp_folder + '": ' + err);
            });
            delete file.tmp_folder;
        }

        delete file.unzipped;
        
        DB.updateFile(file,function(err){
            if(err) return sails.log.error('It was Impossible to mark file with id: ' + file.id + ' as ' + file.status);
            
            /*
             * If it's not possible to mark the file with the status, then no more files will be processed by this thread.
             * (Instead the function will be called again, obviously)
             */
            FileProcessor.processOneFile();

        });
    },





};
