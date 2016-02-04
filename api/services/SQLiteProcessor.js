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
	            var sessions = [];
	            var connections = [];
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
	                    if(result.c == 0) {
	               			file.error_info = 'Session table is empty';
	                    	return callback(file.error_info);
	                    }
	                });

	                q="SELECT * FROM session ORDER BY timestamp,event ASC;";
	                
	                /*
	                 * BUILDING SESSIONS
	                 */
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

	                var connection = null;
	                var last_connection = null;
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
	                        --AND a.friendlyname = friendlyname
	                        --AND a.description = description
	                        --AND a.dnssuffix = dnssuffix
	                        AND a.mac = mac
	                        --AND a.ips = ips
	                        --AND a.gateways = gateways
	                        --AND a.dnses = dnses
	                        --AND a.ssid = ssid
	                        --AND a.bssid = bssid
	                        --AND a.bssidtype = bssidtype
	                        --AND a.timestamp <= timestamp
	                    ) as ended_at
	                    FROM connectivity a
	                    LEFT JOIN location l
	                         ON l.timestamp = a.timestamp
	                    WHERE a.connected = 1
	                    ORDER BY a.mac, started_at ASC, ended_at ASC;`;

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
	                         * Merging connections can produce lost information. First merge: Only connections with an end timestamp
	                         */
	                        sails.log.warn('There are overlaping connections. These have been merged.');
	                        connection = connections.pop();
	                        if(connection.ended_at < result.ended_at ) connection.ended_at = result.ended_at
	                    }
	                    else{
	                        connection = result;
	                    }

	                    connections.push(connection);
	                    last_connection = connection;

	                });

	                q='Select 1=1;';
	                /*
	                 * DO SOME PROCESSING: if run this code out of a db.each, it'll run in parallel so connections array will not exist.
	                 */
	                db.each(q, function(err,result){
	                    var conn = null;
	                    while(connections.length > 0){
	                        conn = connections.shift();
	                        
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

	                    } // while connections.length > 0
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
	                if (err) return callback("Failed to close sqlite3: " + err);
	                return callback(null,sessions);
	            });

	        },
	        function createCompleteSession(sessions,callback){
	            SQLiteProcessor.createCompleteSession(sessions, file, callback);
	        }


	    ],
	    function(err){
	        return FileProcessor.endProcess(err,file)
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

    				DB.insertOne('sessions',session,function(err,sess_c){
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
    					DB.insertOne('connections',connection,function(err,con_c){
    						if(err){
    							file.status = 'failed'
    							file.error_info =  "There's some error inserting connections: " + err
    							return callback(file.error_info)
    						}
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

    						DB.selectOne('locations',loc, function(err,res){
    							if(err){
    								file.status = 'failed'
    								file.error_info =  "There's some error querying locations: " + err
    								return callback(file.error_info)
    							}
    							if(res.rows.length > 0) createConnection(res.rows[0].id,conn);

    							DB.insertOne('locations',loc,function(err,loc_c){
    								if(err){
    									file.status = 'failed'
    									file.error_info =  "There's some error inserting locations: " + err
    									return callback(file.error_info)
    								}
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
    			if(err) return cb(err);
    			return SQLiteProcessor.createCompleteSession(sessions,file,cb);
    		});
    	} //if sessions.length > 0 
    	else{
    		/*
    		 * This 'cb' is the callback provided to createCompleteSession function.
    		 * Basically: When it's no more sessions to process, go to the next file.
    		 */
    		return cb(null);
    	}
    },
}