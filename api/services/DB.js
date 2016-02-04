var util = require('util');
var pgbricks = require('pg-bricks');

var child_process = require('child_process'),
    path = require("path"),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    rmdir = require('rimraf'),
    async = require('async'),
    sqlite = require('sqlite3').verbose();
var pgsql = null

module.exports = {

	start: function(){

		if(!sails.config.connections.postgreSQLDatabase) return sails.log.error('Impossible to connect to the database: You must specify the postgreSQLDatabase connection.');

		this.dburl = util.format('postgres://%s:%s@%s/%s',
				sails.config.connections.postgreSQLDatabase.user,
				sails.config.connections.postgreSQLDatabase.password,
				sails.config.connections.postgreSQLDatabase.host+':'+sails.config.connections.postgreSQLDatabase.port,
				sails.config.connections.postgreSQLDatabase.database
			);

		sails.log.info("Connected to database: " + this.dburl);
		pgsql = pgbricks.configure(this.dburl);
	},

	processOneFile: function(){

		if(!pgsql) DB.start();

		sails.log.info('processOneFile task start to run');
		pgsql.transaction(function(client,callback){
			async.waterfall([

				client.select('*').from('files').where('status','uploaded').limit(1).run,

				function markFileAsProcessing(files,callback){
					if(files.rows.length == 0) return sails.log.info('Nothing to process');

					var file= files.rows[0];
					file.status = 'processing';
					file.updated_at=new Date();

					client.update('files', file).where('id',file.id).run(function(err){
						if(err) return callback(err);
						callback(null,file);
					});
				}
			],
			callback);


		}, function(err, file) {
			/*
			 * TODO: CHANGE HERE TO PROCESS THE NEXT FILE
			 */
			if(err) return sails.log.error("There's some error: " + err);
			DB.decompressZIP(file);

    	});

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
		                
		                DB.processDB(upload);
		                // fs.unlink(unzipped);

		            }
		            else if(unzipped.indexOf(".log") > -1){
		                
		                // FileProcessor.processDB(upload);
		                // fs.unlink(unzipped);

		            }
		            else{
		                // FileProcessor.processQuestionnaire(upload);  
		            }

		        }
		    )//child_process
		})//mkdir tmp folder
	},


	processDB: function(file){
	    // sails.log.info('processing unzipped db file: ' + file.unzipped);

	    async.waterfall([
		    /*
		     * readDB only read the sqlite file, make a little of processing (build sessions and connections)
		     * and then save all to an array.  
		     */
	        function readDB(callback){
	            var db = new sqlite.Database(file.unzipped);
	            var sessions = [];
	            var connectivities = [];
	            var q='';

	            /*TODO: Ask Anna the different start/stop events */
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

	                /*TODO: Review this: probably there're more columns in the where of subquery*/
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

	                q='Select 1=1;'; //db.serialize run somethi
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
	                            if(!finished) sails.log.error("There's a connection starting in a session and ending in the next one. This was ommited.");
	                        }

	                    } // while connectivities.length > 0
	                });




	                /*
	                 * The processQuery assumes that both, sessions and X table (battery, activities,etc.)
	                 * are ordered by timestamp.
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
	                if (err) return callback("failed to close sqlite3: " + err);
	                return callback(null,sessions);
	            });

	        },
	        function createCompleteSession(sessions,callback){
	            DB.createCompleteSession(sessions, file, callback);
	        }


	    ],
	    function(err){
	        return FileProcessor.doSomething(err,file)
	    });

	},

    createCompleteSession: function(sessions,file,cb){
    	if(sessions.length > 0){
    		var session_o = sessions.shift();
    		async.waterfall([
    			function createSession(callback){
    				var session = {};
    				session.started_at = new Date(session_o.started_at);
    				session.ended_at = new Date(session_o.ended_at);
    				session.file_id = file.id

    				pgsql.insert('sessions',session).returning('*').row(function(err,sess_c){
    					callback(null,sess_c);
    				});
    			},
    			/*
    			 * Most of the next functions do almost the same, like a dictionary,
    			 * transform the .db file name attribute into a backend PostgreSQL
    			 * database name attribute, and then it saves de info.
    			 */
    			function createConnections(sess, callback){

    				var createConnection = function(location_id,connection){
    					connection.location_id = location_id;
    					pgsql.insert('connections',connection).returning('*').row(function(err,con_c){
    						if(err) return sails.log.error("There's some error inserting connections: " + err);
    						sails.log.info("Connection inserted with id: " + con_c.id);
    					});
    				}

    				var connections=[];
    				var cwl={}, conn= {}, loc = {};
    				while(session_o.connections.length>0){
    					
    					cwl= session_o.connections.shift(); //connection with location info


    					conn.session_id = sess.id; /*Dictionary*/
    					conn.started_at=new Date(cwl.started_at);
    					conn.ended_at=new Date(cwl.ended_at);
    					conn.name = cwl.name
    					conn.friendly_name = cwl.friendlyname
    					conn.description = cwl.description
    					conn.dns_suffix = cwl.dnssuffix
    					conn.mac = cwl.mac
    					conn.ips = cwl.ips
    					conn.gateways = cwl.gateways
    					conn.dnses = cwl.dnses.trim()
    					conn.t_speed= cwl.tspeed;
    					conn.r_speed= cwl.rspeed;
    					conn.wireless= cwl.wireless;
    					conn.profile= cwl.profile;
    					conn.ssid= cwl.ssid;
    					conn.bssid= cwl.bssid;
    					conn.bssid_type = cwl.bssidtype;
    					conn.phy_type = cwl.phytype;
    					conn.phy_index = cwl.phyindex;
    					conn.connected = cwl.connected;

    					if(cwl.rdns){ //has location info

    						loc.ip = cwl.ip.trim(); /*Dictionary*/
    						loc.rdns = cwl.rdns.trim();
    						loc.asn_number = cwl.asnumber.trim();
    						loc.asn_name = cwl.asname.trim();
    						loc.country_code = cwl.countryCode.trim();
    						loc.city = cwl.city.trim();
    						loc.latitude = cwl.lat.trim();
    						loc.longitude = cwl.lon.trim();

    						pgsql.select('*').from('locations').where(loc).limit(1).run(function(err,res){
    							if(err) return sails.log.error("There's some error querying locations: " + err);
    							if(res.rows.length > 0) createConnection(res.rows[0].id,conn);
    							else
    								pgsql.insert('locations',loc).returning('*').row(function(err,loc_c){
    									if(err) return sails.log.error("There's some error inserting locations: " + err);
    									createConnection(loc_c.id,conn);
    								});
    						});
    					}
    					else createConnection(null,conn);

    				}
					return callback(null,sess);
    			},
    			function createActivities(sess,callback){
    				var activities=[];
    				var act;
    				while(session_o.activity.length > 0){
    					act = session_o.activity.shift();
    					act.loged_at= new Date(act.timestamp);
    					act.session_id= sess.id;
    					act.user_name = act.user;

    					delete act.user;
    					delete act.timestamp;

    					activities.push(act);
    				}

    				DB.insert('activities',activities);
    				return callback(null,sess);
    			},
    			function createBatteryLogs(sess,callback){
    				var battery_logs=[];
    				var b;
    				while(session_o.battery.length>0){
    					b = session_o.battery.shift();
    					b.loged_at = new Date(b.timestamp);
    					b.session_id= sess.id;
    					delete b.timestamp;

    					battery_logs.push(b);
    				}

    				DB.insert('battery_logs',battery_logs);
    				return callback(null,sess);
    			},
    			function createBrowserActivity(sess,callback){
    				var b_acts=[];
    				var b;
    				while(session_o.browseractivity.length>0){
    					b = session_o.browseractivity.shift();

    					b.loged_at = new Date(b.timestamp);
    					b.session_id= sess.id;
    					delete b.timestamp;

    					b_acts.push(b);
    				}

    				DB.insert('browser_activity',b_acts);
    				return callback(null,sess);
    			},
    			function createDNS(sess,callback){
    				var dnss=[];
    				var dns;
    				while(session_o.dns.length>0){
    					dns = session_o.dns.shift();

    					dns.loged_at = new Date(dns.timestamp);
    					dns.source_ip = dns.srcip
    					dns.destination_ip = dns.destip
    					dns.source_port = dns.srcport
    					dns.destination_port = dns.destport
    					dns.session_id= sess.id;


    					delete dns.timestamp;
    					delete dns.srcip
    					delete dns.destip
    					delete dns.srcport
    					delete dns.destport

    					dnss.push(dns);
    				}

    				DB.insert('dns_logs',dnss);
    				return callback(null,sess);
    			},
    			function createHTTP(sess,callback){
    				var https=[];
    				var http;
    				while(session_o.http.length>0){
    					http = session_o.http.shift();

    					http.loged_at = new Date(http.timestamp);
    					http.http_verb = http.httpverb;
    					http.http_verb_param = http.httpverbparam
    					http.http_status_code = http.httpstatuscode
    					http.http_host = http.httphost
    					http.content_type = http.contenttype
    					http.content_length = http.contentlength
    					http.source_ip = http.srcip
    					http.destination_ip = http.destip
    					http.source_port = http.srcport
    					http.destination_port = http.destport

    					http.session_id= sess.id;


    					delete http.httpverb;
    					delete http.httpverbparam
    					delete http.httpstatuscode
    					delete http.httphost
    					delete http.contenttype
    					delete http.contentlength
    					delete http.srcip
    					delete http.destip
    					delete http.srcport
    					delete http.destport
    					delete http.timestamp

    					https.push(http);
    				}

    				DB.insert('http_logs',https);
    				return callback(null,sess);
    			},
    			function createIO(sess,callback){
    				var ios=[];
    				var io;
    				while(session_o.io.length>0){
    					io = session_o.io.shift();

    					io.loged_at = new Date(io.timestamp);

    					io.session_id= sess.id;

    					delete io.timestamp

    					ios.push(io);
    				}

    				DB.insert('io',ios);
    				return callback(null,sess);
    			},
    			function createPorts(sess,callback){
    				var ports=[];
    				var port;
    				while(session_o.ports.length>0){
    					port = session_o.ports.shift();

    					port.loged_at = new Date(port.timestamp);
    					port.source_ip = port.srcip
    					port.destination_ip = port.destip.length > 0?port.destip:null;
    					port.source_port = port.srcport
    					port.destination_port = port.destip.length > 0?port.destport:null;

    					port.session_id= sess.id;

    					delete port.srcip
    					delete port.destip
    					delete port.srcport
    					delete port.destport
    					delete port.timestamp

    					ports.push(port);
    				}

    				DB.insert('ports',ports);
    				return callback(null,sess);
    			},
    			function createProcesses(sess,callback){
    				var procs=[];
    				var proc;
    				while(session_o.procs.length>0){
    					proc = session_o.procs.shift();

    					proc.loged_at = new Date(proc.timestamp);

    					proc.session_id= sess.id;

    					delete proc.timestamp

    					procs.push(proc);
    				}

    				DB.insert('processes',procs);
    				return callback(null,sess);
    			},
    			function createSystemInformation(sess,callback){
    				var infos=[];
    				var si;
    				while(session_o.sysinfo.length>0){
    					si = session_o.sysinfo.shift();

    					si.operative_system = si.os
    					si.memory_installed = si.totalRAM
    					si.hdd_capacity = si.totalHDD
    					si.serial_number = si.serial
    					si.settings_version = si.version
    					si.loged_at = new Date(si.timestamp);

    					si.session_id= sess.id;

    					delete si.os
    					delete si.totalRAM
    					delete si.totalHDD
    					delete si.serial
    					delete si.version
    					delete si.timestamp

    					infos.push(si);
    				}

    				DB.insert('device_info',infos);
    				return callback(null,sess);
    			},
    			function createWifiStats(sess,callback){
    				var stats=[];
    				var stat;
    				while(session_o.wifistats.length>0){
    					stat = session_o.wifistats.shift();

    					stat.t_speed = stat.tspeed
    					stat.r_speed = stat.rspeed
    					stat.loged_at = new Date(stat.timestamp);

    					stat.session_id= sess.id;

    					delete stat.tspeed
    					delete stat.rspeed
    					delete stat.timestamp

    					stats.push(stat);
    				}

    				DB.insert('wifi_stats',stats);
    				return callback(null,sess);
    			}


    		],
    		function(err){
    			if(err) return;
    			return DB.createCompleteSession(sessions,file,cb);
    		});
    	} //if sessions.length > 0 
    	else{
    		sails.log('TERMINO EN TEORIA');
    		return cb(null);
    	}
    },

    insert: function(table, values){
    	if(values.length>0)
	    	pgsql.insert(table,values).returning('*').rows(function(err,inserted_values){
	    		if(err) return sails.log.error("There's some error inserting "+ table +": " + err);
	    		sails.log('Rows inserted in table '+table+': ' + inserted_values.length + ' (' + inserted_values[0].id + '-' + inserted_values[inserted_values.length - 1].id + ')');
	    	});
	    else sails.log.info("Nothing to insert into " + table);
    }



}