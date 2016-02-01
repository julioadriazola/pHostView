var child_process = require('child_process'),
    path = require("path"),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    rmdir = require('rimraf'),
    async = require('async'),
    sqlite = require('sqlite3').verbose();

module.exports = {

    processOneFile: function(){

        sails.log.info('processOneFile task start to run');
        UploadedFile.query("BEGIN;", function(err){
            if(err) return sails.log.error("Impossible to start transaction: " + err );

            // sails.log.silly("BEGIN");
            UploadedFile.findOne({where:{status: "uploaded"}, limit: 1}).populate('device').exec(function(err,upload){
                if(err) return sails.log.error("There's some error querying files: " + err);
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
         * Create a tmp folder to process the file
         */

        var tmpfn = path.dirname(fn) + '/.' + path.basename(fn).replace(/\./g,'') + '/' + path.basename(fn);
        mkdirp(path.dirname(tmpfn),function(err){
            if (err) return sails.log.error('Failed to create .' + path.basename(fn).replace(/\./g,'') + ' temp folder: ' + err);
            if(!fs.existsSync(fn)) return sails.log.warn('' + fn + ' file was not found or is been used');

            fs.rename(fn,tmpfn);
            fn= tmpfn;

            child_process.exec(
                "dtrx -q -f " + fn,
                { cwd: path.dirname(fn)},
                function(err,stdout,stderr){
                    fs.rename(tmpfn,ofn);

                    if(err){
                        rmdir(path.dirname(fn),function(){});
                        return sails.log.error('decompressZIP task failed with file: ' + fn);
                    }

                    unzipped = path.dirname(fn) + "/" + path.basename(fn).replace('.zip','');
                    if(!fs.existsSync(unzipped)){
                        /*
                         * Older versions convention is that a <file_name>.zip must have 
                         * a submit/<file_name> file inside.
                         */
                        unzipped = path.dirname(fn) + "/submit/" + path.basename(fn).replace('.zip','');
                        if(!fs.existsSync(unzipped)){ 
                            // rmdir(path.dirname(fn),function(){});
                            return sails.log.warn('[submit/]' + path.basename(fn).replace('.zip','') + ' unzipped file was not found from file: ' + fn);
                        }
                    }

                    upload.unzipped = unzipped;
                    if(unzipped.indexOf(".pcap") > -1){
                        
                        // FileProcessor.processPCAP(null);
                        // fs.unlink(unzipped);
                    }
                    else if(unzipped.indexOf("info") > -1){
                        // FileProcessor.processInfo(null);
                        // fs.unlink(unzipped);

                    }
                    else if(unzipped.indexOf(".db") > -1){
                        
                        FileProcessor.processDB(upload);
                        // fs.unlink(unzipped);

                    }
                    else if(unzipped.indexOf(".log") > -1){
                        
                        // FileProcessor.processDB(upload);
                        // fs.unlink(unzipped);

                    }
                    else{
                        FileProcessor.processQuestionnaire(upload);  
                    }

                }
            )//child_process
        })//mkdir tmp folder
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
        // sails.log.info('processing unzipped db file: ' + file.unzipped);

        async.waterfall([
            function readDB(callback){
                var db = new sqlite.Database(file.unzipped);
                var sessions = [];
                var connectivities = [];
                var q='';

                var start_events = ['start','restart'];
                var stop_events = ['pause','stop'];
                db.serialize(function(){

                    var session={};
                    var last_session=null;
                    var tmp_s = null;

                    q="SELECT COUNT(*) c FROM session";
                    db.each(q,function(err,result){
                        if(err) return callback(err);
                        if(result.c == 0) return callback('Session table is empty');
                    });

                    q="SELECT * FROM session ORDER BY timestamp,event ASC;";
                    sails.log('Building sessions');
                    db.each(q, function(err,result){ //Results must be in order: start - stop - start - stop...
                        if(err) return callback(err);
                        if(!result) return callback('No results executing query: ' + q);


                        if(last_session && last_session.ended_at == result.timestamp){ 
                            if(start_events.indexOf(result.event) > -1){ //Case stop - start have the same ts
                                tmp_s = sessions.pop
                                last_session = null
                            }
                        }
                        else if(!last_session && tmp_s){
                            if(stop_events.indexOf(result.event) > -1){ //Case stop - start - stop and the first two have the same ts
                                tmp_s.ended_at = result.timestamp
                                sessions.push(tmp_s);
                                last_session = tmp_s;
                                tmp_s = null;
                            }
                            else{ //Case stop - start - start have the same ts
                                sessions.push(tmp_s);
                                last_session = tmp_s;
                                tmp_s = null;
                            }
                        }
                        else{
                            if(!session.started_at){
                                if(stop_events.indexOf(result.event) > -1) return callback('There are overlaping sessions');
                                session.started_at = result.timestamp;
                            }
                            else{
                                if(start_events.indexOf(result.event) > -1) return callback('There are overlaping sessions');
                                session.ended_at = result.timestamp;



                                session.connections = [];
                                session.activity = [];
                                session.battery = [];
                                session.browseractivity = [];
                                session.dns = [];
                                session.http = [];
                                session.io = [];
                                session.ports = [];
                                session.procs = [];
                                session.sysinfo = [];
                                session.wifistats = [];




                                sessions.push(session);
                                last_session = session
                                session = {}
                            }
                        }
                    });

                    var connectivity = null;
                    var last_connectivity = null;
                    var last_mac = null;
                    // var tmp_c = null;

                   q=`SELECT 
                        a.*,
                        l.ip,
                        l.rdns,
                        l.asnumber,
                        l.asname,
                        l.countryCode,
                        l.city,
                        l.lat,
                        l.lon,
                        l.timestamp l_timestamp,
                        a.timestamp as started_at,
                        (
                        Select MIN(timestamp) 
                        FROM connectivity 
                        WHERE connected = 0
                            AND a.name = name
                            AND a.friendlyname = friendlyname
                            AND a.description = description
                            AND a.dnssuffix = dnssuffix
                            AND a.mac = mac
                            AND a.ips = ips
                            AND a.gateways = gateways
                            AND a.dnses = dnses
                            AND a.ssid = ssid
                            AND a.bssid = bssid
                            AND a.bssidtype = bssidtype
                            AND a.timestamp <= timestamp
                        ) as ended_at
                        FROM connectivity a
                        LEFT JOIN location l
                             ON l.timestamp = a.timestamp
                        WHERE a.connected = 1
                        ORDER BY a.mac, started_at ASC, ended_at ASC;`;

                    // q=`SELECT 
                    //     a.*,



                    //     (
                    //         Select MIN(timestamp) 
                    //         FROM connectivity 
                    //         WHERE connected = 0
                    //             AND a.name = name
                    //             AND a.friendlyname = friendlyname
                    //             AND a.description = description
                    //             AND a.dnssuffix = dnssuffix
                    //             AND a.mac = mac
                    //             AND a.ips = ips
                    //             AND a.gateways = gateways
                    //             AND a.dnses = dnses
                    //             AND a.ssid = ssid
                    //             AND a.bssid = bssid
                    //             AND a.bssidtype = bssidtype
                    //             AND a.timestamp <= timestamp
                    //     ) as ended_at,
                    //     timestamp as started_at

                    //     FROM connectivity a
                    //     WHERE a.connected = 1
                    //     ORDER BY a.mac, started_at ASC, ended_at ASC;`;

                    sails.log('Building connectivity and locations');
                    db.each(q, function(err,result){
                        if(err) return callback(err);
                        if(!result) return callback('No results executing query: ' + q);

                        if(result.mac != last_mac){
                            last_mac = result.mac;
                            last_connectivity = null
                        }

                        if(!result.ended_at) result.ended_at = Infinity;

                        if(last_connectivity && last_connectivity.ended_at < Infinity && result.started_at < last_connectivity.ended_at){
                            /*
                             * Merging connections can produce lost information. First merge: Only connections with an end timestamp
                             */
                            sails.log.warn('There are overlaping connectivities. These have been merged.');
                            connectivity = connectivities.pop();
                            if(connectivity.ended_at < result.ended_at ) connectivity.ended_at = result.ended_at
                        }
                        else{
                            connectivity = result;
                        }

                        connectivities.push(connectivity);
                        last_connectivity = connectivity;

                    });

                    q='Select 1=1;';
                    db.each(q, function(err,result){
                        var conn = null;
                        while(connectivities.length > 0){
                            conn = connectivities.shift();
                            
                            if(conn.ended_at == Infinity){
                                var best_i=-1;
                                var best_diff=Infinity;
                                for(var i = 0; i < sessions.length; i++){
                                    if(sessions[i].started_at <= conn.started_at && conn.started_at - sessions[i].started_at < best_diff){
                                        best_diff= conn.started_at - sessions[i].started_at;
                                        conn.ended_at  = sessions[i].ended_at; //Same end timestamp for connection and session
                                        best_i = i;
                                    }
                                }
                                sessions[best_i].connections.push(conn);
                            }
                            else{
                                var finished = false;
                                for(var i = 0; i < sessions.length; i++){
                                    if(sessions[i].started_at <= conn.started_at && sessions[i].ended_at >= conn.ended_at){
                                        sessions[i].connections.push(conn);
                                        finished = true;
                                        break;
                                    }
                                }
                                if(!finished) sails.log.error("There's a connection starting in a session and ending in the next one");
                            }



                        }

                        /*ONLY FOR TEST (Can be commented)*/
                        // for(var i = 0; i < sessions.length; i++){
                        //     for(var j = 0; j < sessions[i].connections.length ; j++){
                        //         if(sessions[i].started_at > sessions[i].connections[j].started_at || sessions[i].ended_at < sessions[i].connections[j].ended_at) sails.log.warn("There's some incoherencies between sessions and connections");
                        //     }
                        // }

                        // for(var i = 0; i < sessions.length; i++){
                        //     sails.log('-=-=-=-=-=-=-=-=-=-=-=-=-');
                        //     sails.log(sessions[i].started_at)
                        //     sails.log(sessions[i].ended_at)
                        //     for(var j = 0; j < sessions[i].connections.length ; j++){
                        //         sails.log(sessions[i].connections[j]);
                        //     }
                        // }
                    });




                    /*
                     * The idea is to make a join like in the merge sort algorithm.
                     * So, there's a session array ordered and a X array (activity,battery,etc.) ordered.
                     * It shouldn't happen that one of this records doesn't match in a session, 
                     * so j starts from i value in the for.
                     */
                    var processQuery = function(table){

                        q = "Select * FROM " + table + " ORDER BY timestamp ASC;";
                        var i = 0;
                        db.each(q, function(err,result){
                            if(err) return callback(err);
                            if(!result) return callback('No results executing query: ' + q);

                            if(sessions[i].started_at <= result.timestamp && sessions[i].ended_at >= result.timestamp){
                                sessions[i][table].push(result);
                            }
                            else{
                                for(var j = i; j < sessions.length; j++ ){
                                    if(sessions[j].started_at <= result.timestamp && sessions[j].ended_at >= result.timestamp){
                                        sessions[j][table].push(result);
                                        i=j;
                                        break;
                                    }
                                }
                            }
                        });

                        // db.each('SELECT 1=1;',function(e,l){
                        //     for(var l = 0; l < sessions.length; l++){
                        //         sails.log('-=-=-=-=-=-=-=-=-=-=-=-=-');
                        //         sails.log(sessions[l].started_at)
                        //         sails.log(sessions[l].ended_at)
                        //         for(var j = 0; j < sessions[l][table].length ; j++){
                        //             sails.log(sessions[l][table][j].timestamp);
                        //         }
                        //     }
                        // })
                    };

                    sails.log('Building other tables');
                    processQuery('activity');
                    processQuery('battery');
                    processQuery('browseractivity');
                    processQuery('dns');
                    processQuery('http');
                    processQuery('io');
                    processQuery('ports');
                    processQuery('procs');
                    processQuery('sysinfo');
                    processQuery('wifistats');

                });

                db.close(function(err) {
                    if (err)
                        return callback("failed to close sqlite3: " + err);
                    return callback(null,sessions);
                });

            },
            function beginTransaction(sessions,callback){
                sails.log(sessions);
                UploadedFile.query("BEGIN;", function(err){
                    if(err) return sails.log.error("Impossible to start transaction: " + err );
                    callback(null,sessions);
                });
            },
            function createCompleteSession(sesisons,callback){
                var session = sessions.shift();

                //TODO: Procesar aqui
            }
        ],
        function(err){
            return FileProcessor.doSomething(err,file)
        });


        //     db.serialize(function(){

        //         sails.log.silly('Process session');
        //         sqlitedb.each("SELECT * FROM session", function(err, r) {

        //             if (!r || err)
        //                 return;
        //             r.id = id;
        //             delete r.dnssuffix;
        //             client.insert('connectivity',r).run(icb);
        //         });

        //     }); //db.serialize


        // FileProcessor.doSomething(null,file);
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
        // fs.unlink(file.unzipped);

        // sails.log('ERROR: ' + err);
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
