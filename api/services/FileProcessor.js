var child_process = require('child_process'),
    path = require("path"),
    fs = require('fs'),
    mkdirp = require('mkdirp');

module.exports = {

    processOneSQLiteFile: function(){
        DB.nextSQLiteFileToProcess(function(err,file){
            if(err) return sails.log.error("There's some error: " + err);
            FileProcessor.nextIfParentExists(file);
        });
    },


    processOneFile: function(){
        DB.nextFileToProcess(function(err,file){
            if(err) return sails.log.error("There's some error: " + err);
            FileProcessor.nextIfParentExists(file);
        });
    },

    /*
     * It gives the file type starting from the file name. This is the list of 
     * valid processable files.
     */
    getType: function(fn){
        if(fn.indexOf("_stats.db") > -1)                    return 'sqlite'
        else if(fn.indexOf("_last.pcap") > -1)              return 'pcap'
        else if(fn.indexOf("_questionnaire.json") > -1)     return 'survey'
        //json could be pageload or video. It's necessary to see the content to determine it.
        else if(fn.indexOf(".json") > -1)                   return 'json' 
        else return null

    },

    
    /*
     * It determines wether or not the session/connection exists.
     * In the case of sqlite files it's not necessary.
     */
    nextIfParentExists: function(file){
        var fileType = FileProcessor.getType(file.basename);
        var table = '';
        var find = {};



        if(['sqlite'].indexOf(fileType) > -1) return FileProcessor.decompressZIP(file);
        else if(['survey','json'].indexOf(fileType) > -1){
            // 0                1         2
            // sessiontimestamp_timestamp_browserupload.json                        --> json (video or pageupload)
            // sessiontimestamp_somenumber_questionnaire.json                       --> survey
            table = 'sessions';
            find.started_at= new Date(parseInt(file.basename.split('_')[0]));
        }
        else if(['pcap'].indexOf(fileType) > -1){
            // 0             1             2  3                                    4
            // session       connection    #  interface_id                         sufix   
            // 1456320420964_1456320421042_10_A2692622-D935-45DD-BC6A-0FEA4F88524C_part.pcap.zip

            table = 'connections'
            find.started_at= new Date(parseInt(file.basename.split('_')[1]));
        }
        else{
            file.status = 'typeNotfound'
            file.error_info = "It's impossible to determine the " + file.basename + " file type"
            return FileProcessor.endProcess(null,file);
        }

        DB.selectOne(table,find,function(err,result){
            if(err){
                file.status = 'failed'
                file.error_info = "There's some error querying the table " + table;
                return FileProcessor.endProcess(err,file);
            }

            //Session/Connection founded, so process the file.
            if(result) {

                /*
                 * PCAP are processed separately because in this step we don't
                 * want to decompress the file yet, only 'put parts together',
                 * that means, fill 'pcap' and 'pcap_files' tables.
                 */
                if(['pcap'].indexOf(fileType) > -1) return PCAP.process(file,result);
                return FileProcessor.decompressZIP(file,result);
            }
            else{
                file.status = 'waitingParent'
                return FileProcessor.endProcess(null,file);
            }

        });
    },

    

    decompressZIP: function(upload, parent){
        var ofn = upload.folder + '/' + upload.basename; //Original file name
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
                    if(FileProcessor.getType(upload.basename) == 'survey'){
                        SurveyProcessor.process(upload,parent);  
                    }
                    else if(FileProcessor.getType(upload.basename) == 'sqlite'){
                        SQLiteProcessor.process(upload);
                    }
                    else if(FileProcessor.getType(upload.basename) == 'json'){
                        //TODO: write json processor
                        JSONProcessor.process(upload,parent);
                    }
                    else{
                        FileProcessor.endProcess(upload);
                    }

                }
            )//child_process
        })//mkdir tmp folder
    },

    endProcess: function(err,file){
        /*
         * See more details about status on ./README.md
         */

        if(['waitingFile','waitingParent','failed','typeNotfound'].indexOf(file.status) > -1 ){
            sails.log.warn("File with id: " + file.id + " was marked as "+ file.status+".");
            if(file.error_info) sails.log.warn(file.error_info)
            if(err) sails.log.error(err);
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

        if(file.unzipped) delete file.unzipped;
        
        DB.updateFile(file,function(err){
            if(err) return sails.log.error('It was Impossible to mark file with id: ' + file.id + ' as ' + file.status);
            
            /*
             * If it's not possible to mark the file with the status, then no more files will be processed by this thread.
             * (Instead the function will be called again, obviously)
             */
            if(FileProcessor.getType(file.basename) == 'sqlite') FileProcessor.processOneSQLiteFile();
            else FileProcessor.processOneFile();

        });
    },

    resetFiles: function(){
        DB.resetEntity('files',['waitingFile','waitingParent','failed','typeNotfound'],function(err,res){
            if(err) sails.log.error("There was some error updating files: " + err)
        })
    },




};
