var child_process = require('child_process'),
    path = require("path"),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    rmdir = require('rimraf'),
    async = require('async');

module.exports = {

    processOneFile: function(){

        sails.log.info('processOneFile task start to run');
        UploadedFile.query("BEGIN;", function(err){
            if(err) return sails.log.error("Impossible to start transaction: " + err );

            // sails.log.silly("BEGIN");
            UploadedFile.findOne({where:{status: "uploaded"}, limit: 1}).populate('device').exec(function(err,upload){
                if(!upload) return sails.log.info("Nothing to process");

                // sails.log.silly("FIND");
                UploadedFile.update({id: upload.id},{status: "processing", updated_at: new Date()}).exec(function(err,updated){
                    if(err) return UploadedFile.query("ROLLBACK;",function(err){ /*sails.log.silly("ROLLBACK")*/});

                    // sails.log.silly("UPDATE");
                    return UploadedFile.query("COMMIT;",function(err){
                        if(err) {
                            sails.log.error("ABORTING PROCESS...");
                            sails.log.error("Something went wrong with file id: " + upload.id);
                        }
                        else {
                            // sails.log.silly("COMMIT");
                            FileProcessor.decompressZIP(updated[0]);
                        }
                    });

                });//UPDATE
            });//FIND
        });//BEGIN TRANSACTION
    },

    decompressZIP: function(upload){
        var ofn = process.cwd() + upload.file_path; //Original file name
        var fn = ofn;

        /*
         * Create the submit folder if doesn't exist.
         */

        mkdirp(path.dirname(ofn) + '/submit',function(error){
            if(error) return sails.log.error('Failed to create submit folder: ' + error);
            if(!fs.existsSync(fn)) return sails.log.warn('' + fn + ' file was not found or is been used');
            
            /*
             * A temp folder to unzip the file and delete it in case of an error
             */
            var tmpfn= path.dirname(fn) + '/.' + path.basename(fn).replace(/\./g,'') + '/' + path.basename(fn);
            mkdirp(path.dirname(tmpfn), function(err){
                if (err) return sails.log.error('Failed to create .' + path.basename(fn).replace(/\./g,'') + ' temp folder: ' + err);

                fs.rename(fn,tmpfn);
                fn= tmpfn;

                child_process.exec(
                    "dtrx -q -f " + fn,
                    { cwd: path.dirname(fn)},
                    function(err, stdout, stderr){
                        fs.rename(fn,ofn);

                        if(err){
                            rmdir(path.dirname(fn),function(){});
                            return sails.log.error('decompressZIP task failed with file: ' + fn);
                        }

                        /*
                         * The convention is that a <file_name>.zip must have 
                         * a submit/<file_name> file inside.
                         */
                        unzipped = path.dirname(fn) + "/submit/" + path.basename(fn).replace('.zip','');
                        if(!fs.existsSync(unzipped)){
                            rmdir(path.dirname(fn),function(){});
                            return sails.log.warn('unzipped file ' + unzipped + ' was not found from file: ' + fn);
                        }

                        /*
                         * original destination relative to original filename
                         */
                        var destination = path.dirname(ofn) + '/submit/' + path.basename(unzipped);

                        fs.rename(unzipped,destination);
                        rmdir(path.dirname(fn),function(){});
                        unzipped = destination;

                        upload.unzipped = unzipped;
                        if(unzipped.indexOf(".pcap") > -1){
                            
                            // FileProcessor.processPCAP(null);
                            // fs.unlink(unzipped);
                            /* TODO: Mark the file as processed in the DB*/
                        }
                        else if(unzipped.indexOf("info") > -1){
                            // FileProcessor.processInfo(null);
                            // fs.unlink(unzipped);
                            /* TODO: Mark the file as processed in the DB*/

                        }
                        else if(unzipped.indexOf(".db") > -1){
                            
                            // FileProcessor.processDB(null);
                            // fs.unlink(unzipped);
                            /* TODO: Mark the file as processed in the DB*/

                        }
                        else{
                            FileProcessor.processQuestionnaire(upload);  
                        }
                    }
                ); //child_process
            }); //mkdir tmp folder
        }); //mkdir submit folder
    },

    processPCAP: function(file){
        sails.log.info('processing unzipped pcap file: ' + file.unzipped);


        FileProcessor.doSomething(null,file);
    },

    processInfo: function(file){
        sails.log.info('processing unzipped info file: ' + file.unzipped);



        FileProcessor.doSomething(null,file);
    },

    processDB: function(file){
        sails.log.info('processing unzipped db file: ' + file.unzipped);


        FileProcessor.doSomething(null,file);
    },

    processQuestionnaire: function(file){
        sails.log.info('processing unzipped survey file: ' + file.unzipped);

        async.waterfall([
            function readJSON(callback){
                fs.readFile(file.unzipped,'utf8',function(err,data){
                    if (err) return callback(err);
                    return callback(null,JSON.parse(data));
                });
            },
            function createSurvey(doc,callback){

                var surv= {};
                surv.qoe = parseInt(doc.page2.QoE);
                surv.duration = doc.duration;
                surv.file = file;

                Survey.create(surv).exec(function(err,survey){
                    if(err) return callback(err);
                    return callback(null,doc,survey);
                });
            },
            function createPurposes(doc,survey,callback){

                /*
                 * TODO: Process file with new format.
                 */
                var purposes=[];
                for(var process in doc.page1){
                  for(var tag in doc.page1[process]){
                    if(tag.length >0 ){
                        var purpose= {};
                        purpose.survey = survey;
                        purpose.process = process;
                        purpose.tag = tag;
                        purposes.push(purpose);
                    }
                  }
                }
                if(purposes.length == 0) return callback(null,doc,survey);
                SurveyPurpose.create(purposes).exec(function(err,result){
                    if(err) return callback(err,survey,purposes);
                    return callback(null,doc,survey);
                });
            },
            function createProblems(doc,survey,callback){
                /*
                 * TODO: Process file with new format.
                 */
                var problems=[];
                for(var process in doc.page3){
                  for(var tag in doc.page3[process]){
                    if(tag.length >0 ){
                        var problem= {};
                        problem.survey = survey;
                        problem.process = process;
                        problem.tag = tag;
                        problems.push(problem);
                    }
                  }
                }

                if(problems.length == 0) return callback(null,doc,survey);
                SurveyProblem.create(problems).exec(function(err,result){
                    if(err) return callback(err,survey,problems);
                    return callback(null,doc,survey);
                });
            }
        ],
        function(err,survey,other){
            return FileProcessor.doSomething(err,file)
        });

          

        
    },

    doSomething: function(err,file){
        

        /*
         * IMPORTANT: Uncomment the next line;
         */
        // fs.unlink(files[i].unzipped);
        if(err) {
            file.status = "errored";
            sails.log.error("There was some problem processing the file with id: " + file.id);
            sails.log.error(err);
        }
        else{
            file.status = "processed";
            sails.log.info("File with id: " + file.id + " was processed successfully");
        }
        
        UploadedFile.query("BEGIN;", function(err){
            if(err) return sails.log.error("Impossible to start transaction: " + err );
            // sails.log.silly("BEGIN");
            UploadedFile.update({id: file.id},{status: file.status, updated_at: new Date()}).exec(function(err,updated){

                if(err) UploadedFile.query("ROLLBACK;",function(err){ /*sails.log.silly("ROLLBACK at end")*/});
                // sails.log.silly("UPDATE");
                UploadedFile.query("COMMIT;",function(err){
                    if(err) {
                        sails.log.error("ABORTING PROCESS...");
                        sails.log.error("Something went wrong with file id: " + upload.id);
                    }
                    // sails.log.silly("COMMIT");
                });
            });//UPDATE
        });//BEGIN TRANSACTION




    },





};
