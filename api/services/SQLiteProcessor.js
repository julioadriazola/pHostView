var async = require('async'),
    sqlite = require('sqlite3').verbose();

module.exports = {
	process: function(file){

	    async.waterfall([
		    /*
		     * readDB only read the sqlite file, make a little processing (build sessions and connections)
		     * and then save all to an array.  
		     */
	        function readDB(callback){
	            var db = new sqlite.Database(file.unzipped);
	            var session = {};
	            var connections = [];
	            var q='';

	            db.serialize(function(){

	            	/*
	            	 * There must be only one session per file.
	            	 */

	                q=`SELECT COUNT(*) c FROM (
		                	SELECT
								a.timestamp started_at,
								a.event start_event,
								MIN(b.timestamp) ended_at,
								b.event stop_event
							FROM session  a
							LEFT JOIN session b
								ON a.timestamp < b.timestamp
								AND b.event IN ('pause','stop')
							WHERE a.event IN ('start','restart')
							GROUP BY a.timestamp,a.event
						) a`;

	                db.each(q,function(err,result){
	                    if(err) return callback(err);
	                    if(result.c != 1) {
	               			file.error_info = "There must be only one session per file and this has " + result.c;
	                    	return callback(file.error_info);
	                    }
	                });



	                q=`SELECT
							a.timestamp started_at,
							a.event start_event,
							MIN(b.timestamp) ended_at,
							b.event stop_event
						FROM session  a
						LEFT JOIN session b
							ON a.timestamp < b.timestamp
							AND b.event IN ('pause','stop')
						WHERE a.event IN ('start','restart')
						GROUP BY a.timestamp,a.event
						ORDER BY a.timestamp ASC`;
	                /*
	                 * BUILDING SESSIONS
	                 */

	                db.each(q, function(err,result){
	                	if(err) return callback(err);
	                	if(!result) return callback('No results executing query: ' + q);

	                	if(!result.ended_at){
	                		sails.log.warn("There's a opened session");
	                		result.ended_at = Infinity;
	                	}

	                	session = result
	                	session.connections = [];
	                	session.activity = [];
	                	session.powerstate = [];
	                	session.browseractivity = [];
	                	session.io = [];
	                	session.ports = [];
	                	session.procs = [];
	                	session.sysinfo = [];
	                	session.wifistats = [];
	                	session.netlabel = [];

	                });


	                var connection = null;
	                var last_connection = null;
	                var last_mac = null;

	               q=`Select 
							a.*,
							l.public_ip,
							l.reverse_dns,
							l.asnumber,
							l.asname,
							l.countryCode,
							l.city,
							l.lat,
							l.lon,
							l.connstart l_timestamp,
							a.timestamp started_at,
							MIN(b.timestamp) ended_at 
						FROM connectivity a
						LEFT JOIN connectivity b
							ON a.mac = b.mac
							AND b.connected = 0
							AND a.timestamp <= b.timestamp
						LEFT JOIN location l 
							ON a.timestamp = l.connstart
						WHERE a.connected = 1
						GROUP BY a.timestamp
						ORDER BY a.mac ASC, started_at ASC, ended_at ASC`;

	                /*
	                 * BUILDING CONNECTIONS AND LOCATIONS
	                 */
	                db.each(q, function(err,result){
	                    if(err) return callback(err);
	                    if(!result) return callback('No results executing query: ' + q);

	                    if(result.mac != last_mac){
	                        last_mac = result.mac;
	                        last_connection = null
	                    }

	                    if(!result.ended_at) result.ended_at = Infinity;

	                    if(last_connection && last_connection.ended_at < Infinity && result.started_at < last_connection.ended_at){
	                        /*
	                         * Merging connections can produce lost information.
	                         */
	                        sails.log.warn('There are overlaping connections. These have been merged.');
	                        connection = connections.pop();
	                        if(connection.ended_at < result.ended_at ) connection.ended_at = result.ended_at

	                        // If session hasn't an end, set it as the maximum possible value < Infinity
	                        if(session.ended_at == Infinity)
	                        	if(!session.best_ended_at && result.timestamp < Infinity) session.best_ended_at = result.timestamp
	                        	if(session.best_ended_at && result.timestamp < Infinity && session.best_ended_at < result.timestamp) session.best_ended_at = result.timestamp
	                    }
	                    else{
	                        connection = result;
	                        connection.dns = [];
	                        connection.http = [];
	                    }

	                    connections.push(connection);
	                    last_connection = connection;

	                });

	                var insertIntoSessions = function(table){

	                    q = "Select * FROM " + table + " ORDER BY timestamp ASC;";
	                    if(session)
		                    db.each(q, function(err,result){
		                        if(err) return callback(err);
		                        if(!result) return callback('No results executing query: ' + q);

		                        // Maybe we can suppose that this always be true and remove the if/else and only add it to the sessions[table]
		                        if(session.started_at <= result.timestamp && session.ended_at >= result.timestamp){		
		                            session[table].push(result);

		                            // If session hasn't an end, set it as the maximum possible value < Infinity
		                            if(session.ended_at == Infinity)
		                            	if(!session.best_ended_at && result.timestamp < Infinity) session.best_ended_at = result.timestamp
		                            	if(session.best_ended_at && result.timestamp < Infinity && session.best_ended_at < result.timestamp) session.best_ended_at = result.timestamp

		                        }
		                        else{
		                        	sails.log.warn("There's a " + table + " without session");
		                        }
		                    });
	                };

	                var insertIntoConnections = function(table){

	                    q = "Select * FROM " + table + " ORDER BY timestamp ASC;";
	                    if(session)
		                    db.each(q, function(err,result){
		                        if(err) return callback(err);
		                        if(!result) return callback('No results executing query: ' + q);

		                        var hasConnection = false;
		                        for(var i = 0; i < connections.length; i++){
		                        	if(connections[i].started_at == result.connstart && connections[i].started_at <= result.timestamp && connections[i].ended_at >= result.timestamp){
		                        	    connections[i][table].push(result);
		                        	    hasConnection = true;
		                        	    // If session hasn't an end, set it as the maximum possible value < Infinity
		                        	    if(session.ended_at == Infinity)
		                        	    	if(!session.best_ended_at && result.timestamp < Infinity) session.best_ended_at = result.timestamp
		                        	    	if(session.best_ended_at && result.timestamp < Infinity && session.best_ended_at < result.timestamp) session.best_ended_at = result.timestamp
		                        	    break;
		                        	}
		                        }

		                        if(!hasConnection) sails.log.warn("There's a " + table + " without connection");
		                    });
	                };

	                sails.log('Building other tables');
	                insertIntoSessions('activity');
	                insertIntoSessions('powerstate');
	                insertIntoSessions('browseractivity');
	                insertIntoSessions('io');
	                insertIntoSessions('ports');
	                insertIntoSessions('procs');
	                insertIntoSessions('sysinfo');
	                insertIntoSessions('wifistats');
	                insertIntoSessions('netlabel');
	                insertIntoConnections('dns');
	                insertIntoConnections('http');

	            });

	            db.close(function(err) {
	                if (err) return callback("Failed to close sqlite3: " + err);
	                session.connections = connections;

	                return callback(null,session);
	            });

	        },
	        function createCompleteSession(session,callback){
	            SQLiteProcessor.createCompleteSession(session, file, callback);
	        }


	    ],
	    function(err){
	        return FileProcessor.endProcess(err,file)
	    });

	},

    createCompleteSession: function(session,file,cb){
    	if(session)
		async.waterfall([
			function createSession(callback){
				var sess = {};
				if(session.best_ended_at) session.ended_at = session.best_ended_at			//In case that the session has no end
				sess.started_at = new Date(session.started_at);
				sess.ended_at = new Date(session.ended_at);
				sess.file_id = file.id

				DB.insertOne('sessions',sess,function(err,sess_c){
					if(err){
					    file.status = 'failed'
					    file.error_info = "It was impossible to insert values to sessions table"
					    return callback(file.error_info + ": " + err);
					}

					sails.log.info("Survey created with id: " + sess_c.id)
					return callback(null,sess_c);
				});
			},
			/*
			 * Most of the next functions do almost the same, like a dictionary,
			 * transform the .db file name attribute into a backend PostgreSQL
			 * database name attribute, and then it saves de info.
			 */
			function createActivities(sess,callback){
				var activities=[];
				var act;
				while(session.activity.length > 0){
					act = session.activity.shift();
					act.logged_at= new Date(act.timestamp);
					act.session_id= sess.id;
					act.user_name = act.user;

					delete act.user;
					delete act.timestamp;

					activities.push(act);
				}

				DB.insert('activities',activities,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createBatteryLogs(sess,callback){
				var battery_logs=[];
				var b;
				while(session.powerstate.length>0){
					b = session.powerstate.shift();
					b.logged_at = new Date(b.timestamp);
					b.session_id= sess.id;
					delete b.timestamp;

					battery_logs.push(b);
				}

				DB.insert('power_states',battery_logs,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createBrowserActivity(sess,callback){
				var b_acts=[];
				var b;
				while(session.browseractivity.length>0){
					b = session.browseractivity.shift();

					b.logged_at = new Date(b.timestamp);
					b.session_id= sess.id;
					delete b.timestamp;

					b_acts.push(b);
				}

				DB.insert('browser_activity',b_acts,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createIO(sess,callback){
				var ios=[];
				var io;
				while(session.io.length>0){
					io = session.io.shift();

					io.logged_at = new Date(io.timestamp);

					io.session_id= sess.id;

					delete io.timestamp

					ios.push(io);
				}

				DB.insert('io',ios,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createPorts(sess,callback){
				var ports=[];
				var port;
				while(session.ports.length>0){
					port = session.ports.shift();

					port.logged_at = new Date(port.timestamp);
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

				DB.insert('ports',ports,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createProcesses(sess,callback){
				var procs=[];
				var proc;
				while(session.procs.length>0){
					proc = session.procs.shift();

					proc.logged_at = new Date(proc.timestamp);

					proc.session_id= sess.id;

					delete proc.timestamp

					procs.push(proc);
				}

				DB.insert('processes',procs,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createSystemInformation(sess,callback){
				var infos=[];
				var si;
				while(session.sysinfo.length>0){
					si = session.sysinfo.shift();

					si.operative_system = si.os
					si.memory_installed = si.totalRAM
					si.hdd_capacity = si.totalHDD
					si.serial_number = si.serial
					si.logged_at = new Date(si.timestamp);

					si.session_id= sess.id;

					delete si.os
					delete si.totalRAM
					delete si.totalHDD
					delete si.serial
					delete si.timestamp

					infos.push(si);
				}

				DB.insert('device_info',infos,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},
			function createWifiStats(sess,callback){
				var stats=[];
				var stat;
				while(session.wifistats.length>0){
					stat = session.wifistats.shift();

					stat.t_speed = stat.tspeed
					stat.r_speed = stat.rspeed
					stat.logged_at = new Date(stat.timestamp);

					stat.session_id= sess.id;

					delete stat.tspeed
					delete stat.rspeed
					delete stat.timestamp

					stats.push(stat);
				}

				DB.insert('wifi_stats',stats,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},

			function createNetLabels(sess,callback){
				var netlabels=[];
				var netlabel;
				while(session.netlabel.length>0){
					netlabel = session.netlabel.shift();

					netlabel.logged_at = new Date(netlabel.timestamp);

					netlabel.session_id= sess.id;

					delete netlabel.timestamp

					netlabels.push(netlabel);
				}

				DB.insert('netlabels',netlabels,function(err,inserted_values){
                    if(err) return callback(sess)
					callback(null,sess);
                });
			},

			function createConnections(sess, callback){

				var runCallback = function(){
					//When dns and http are processed, then it's possible to run the callback
					var nextf=true;
					for(var j= 0; j < conn_processed.length; j++){
						if(!(conn_processed[j].dns && conn_processed[j].http )){
							nextf = false;
							break;
						}
					}
					return nextf
				}

				var createDNS = function (conn,dns_array,conn_index){


    				var dnss=[];
    				var dns;
    				while(dns_array.length>0){
    					dns = dns_array.shift();

    					dns.logged_at = new Date(dns.timestamp);
    					dns.source_ip = dns.srcip
    					dns.destination_ip = dns.destip
    					dns.source_port = dns.srcport
    					dns.destination_port = dns.destport
    					dns.connection_id= conn.id;


    					delete dns.timestamp;
    					delete dns.srcip
    					delete dns.destip
    					delete dns.srcport
    					delete dns.destport
    					delete dns.connstart

    					dnss.push(dns);
    				}

    				DB.insert('dns_logs',dnss,function(err,inserted_values){
	                    if(err) return callback(sess)

	                    conn_processed[conn_index].dns = true;
	                    if(runCallback()) return callback(null,sess);
	                });
    			};

    			var createHTTP = function(conn,http_array,conn_index){
    				var https=[];
    				var http;
    				while(http_array.length>0){
    					http = http_array.shift();

    					http.logged_at = new Date(http.timestamp);
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

    					http.connection_id= conn.id;


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
    					delete http.connstart

    					https.push(http);
    				}

    				DB.insert('http_logs',https,function(err,inserted_values){
	                    if(err) return callback(sess)
	                    conn_processed[conn_index].http = true;
	                	if(runCallback()) return callback(null,sess);

	                });
    			}

				var createConnection = function(location_id,connection,connection_with_location,index){
					
					connection.location_id = location_id;
					var dns_array = connection_with_location.dns;
					var http_array = connection_with_location.http;

					DB.insertOne('connections',connection,function(err,con_c){
						if(err){
							file.status = 'failed'
							file.error_info =  "There's some error inserting connections: " + err
							return callback({id: connection.session_id})
						}
						sails.log.info("Connection inserted with id: " + con_c.id);

						createDNS(con_c,dns_array,index);
						createHTTP(con_c,http_array,index);
					});
				}

				var connections=[];
				var conn_processed = [];
				for(var i = 0; i < session.connections.length; i++)
					conn_processed.push({dns:false,http:false});

				var cwl={}, conn= {}, loc = {};
				var i  = 0;
				while(session.connections.length>0){
					
					cwl= session.connections.shift(); //connection with location info


					conn.session_id = sess.id;
					conn.started_at=new Date(cwl.started_at);
					conn.ended_at=cwl.ended_at<Infinity?new Date(cwl.ended_at): new Date(session.ended_at);
					conn.name = cwl.name
					conn.friendly_name = cwl.friendlyname
					conn.description = cwl.description
					conn.dns_suffix = cwl.dnssuffix
					conn.mac = cwl.mac
					conn.ips = cwl.ips.split(",");
					conn.gateways = cwl.gateways.split(",");
					conn.dnses = cwl.dnses.trim().split(",");
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

						loc.public_ip = cwl.public_ip.trim();
						loc.reverse_dns = cwl.reverse_dns.trim();
						loc.asn_number = cwl.asnumber.trim();
						loc.asn_name = cwl.asname.trim();
						loc.country_code = cwl.countryCode.trim();
						loc.city = cwl.city.trim();
						loc.latitude = cwl.lat.trim();
						loc.longitude = cwl.lon.trim();

						DB.createOneIfNotExist('locations',loc,function(err,loc_c){
							if(err){
								file.status = 'failed'
								file.error_info =  "There's some error querying/inserting locations: " + err
								return callback(sess)
							}

							createConnection(loc_c.id,conn,cwl,i)
						});

					}
					else createConnection(null,conn,cwl,i);

					i++;
				}
			},

		],
		function(err){
			if(err && err.id)
				DB.deleteRow('sessions',{id: err.id}, function(qerr,res){
				    
				    //This happen cause all the tables has a ON DELETE CASCADE statement for the session_id.
				    sails.log.warn("All the information associated with this session (id: " +  err.id + ") was deleted")


				    file.status = 'failed'
				    file.error_info = "There was some errors processing the survey file"

				    return cb(null)
				})
			else return cb(err); //Go to the next file
		});

    },
}