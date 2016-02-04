async = require('async');
module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'sessions',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},
		
		started_at:{
			type: 'string'
		},

		ended_at:{
			type: 'string'
		},

		file:{
			model: 'uploadedFile',
			columnName: 'file_id'
		},

		/*TODO: ADD one to many relationships */

	},
	autoCreatedAt: false,
	autoUpdatedAt: false,

	createCompleteSession: function(sessions,file,cb){

		if(sessions.length > 0){
			var session_o = sessions.shift();
			async.waterfall([
				function createSession(callback){
					var session = {};
					session.started_at = new Date(session_o.started_at).toISOString();
					session.ended_at = new Date(session_o.ended_at).toISOString();
					session.file = file

					Session.create(session).exec(function(err,sess){
						sails.log.info('Session created with id: ' + sess.id);
						if(err) return callback(err);
						return callback(null,sess);
					});
				},
				/*
				 * Most of the next functions do almost the same, like a dictionary,
				 * transform the .db file name attribute into a backend PostgreSQL
				 * database name attribute, and then it saves de info.
				 */
				function createConnections(sess, callback){
					var connections=[]
					var cwl;
					while(session_o.connections.length>0){
						cwl= session_o.connections.shift(); //connection with location info

						cwl.session = sess;
						cwl.started_at=new Date(cwl.started_at).toISOString();
						cwl.ended_at=new Date(cwl.ended_at).toISOString();
						cwl.t_speed= cwl.tspeed;
						cwl.r_speed= cwl.rspeed;
						cwl.phy_index = cwl.phyindex
						cwl.phy_type = cwl.phytype
						cwl.friendly_name = cwl.friendlyname
						cwl.bssid_type = cwl.bssidtype
						cwl.dns_suffix = cwl.dnssuffix
						cwl.dnses = cwl.dnses.trim();

						if(cwl.l_timestamp){ //has location info
							cwl.rdns = cwl.rdns.trim();
							cwl.city = cwl.city.trim();
							cwl.asn_number = cwl.asnumber.trim();
							cwl.asn_name = cwl.asname.trim();
							cwl.country_code = cwl.countryCode.trim();
							cwl.latitude = cwl.lat.trim();
							cwl.longitude = cwl.lon.trim();
						}

						connections.push(cwl);
					}

					Connection.create(connections).exec(function(err,c_created){
						if(err) return callback(err);
						sails.log.info('Se crearon: ' + c_created.length + ' connections de ' + connections.length);

						return callback(null,sess);
					});
				},
				function createActivities(sess,callback){
					var activities=[];
					var act;
					var q=''
					while(session_o.activity.length > 0){
						act = session_o.activity.shift();
						act.loged_at= new Date(act.timestamp).toISOString();
						act.session= sess;

						// q = q+"('" + act.pid + "','" + act.name + "','" + act.description
						//  + "'," + act.fullscreen + "," + act.idle + ",'" + act.loged_at + "','" + act.user + "'," 
						//  + act.session.id + "),"; 
						activities.push(act);
					}

					sails.log.warn(q);

					Activity.create(activities).exec(function(err,a_created){
						if(err) {
							sails.log.error(err);
							return callback(err);
						}
						sails.log.info('Se crearon: ' + a_created.length + ' activities de ' + activities.length);

						// for(var i = 0; i < a_created.length; i++){
						// 	sails.log(a_created[i]);
						// }

						return callback(null,sess);
					});
				}


			],
			function(err){
				if(err) return;
				sails.log('Pasa por aqui');
				return Session.createCompleteSession(sessions,file,cb);
				// if(err) return Session.query("ROLLBACK;",function(errq){
				// 	session_o = null;
				// 	sails.log.warn("ROLLBACK TRANSANCTION;")
					// if(session_o == null) return cb(err);
				// });
			});
		}
		else{
			return cb(null);
		}

	}


	// createIfNotExists: function(attributes, cb){
	// 	Device.findOne(attributes).exec(function(err, device){
	// 		if(err) return cb(err);
	// 		if(device) return cb(null, device);

	// 		Device.create(attributes).exec(function(err_c, device_created){
	// 			if(err_c) return cb(err_c);
	// 			return cb(null, device_created);
	// 		});
	// 	});
	// }
}
