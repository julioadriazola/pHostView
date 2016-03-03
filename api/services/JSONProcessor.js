var async = require('async'),
	path = require("path"),
	fs = require('fs');

var Clone = function(x) {
  var y={};
  for(var i in x){
  	y[i] = x[i];
  }
  return y;
};

module.exports = {
	process: function(file,session){
		async.waterfall([
		    function readJSON(callback){
		        fs.readFile(file.unzipped,'utf8',function(err,data){
		            if (err) return callback(err);
		            return callback(null,JSON.parse(data));
		        });
		    },
		    function howToProcessIt(doc,callback){
		    	//Only video streaming files must have the VideoSessions object.
		    	if(doc.VideoSessions) return JSONProcessor.processVideo(file,session,doc,callback)

		    	//Pageload case
	    		return callback(null)
		    },
		],
		function(err){
		    return FileProcessor.endProcess(err,file)
		});
	},

	processVideo: function(file,session,json,nextFunction){
		async.waterfall([
		    function createVideoSession(callback){

		    	// "VideoSessions": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"start_timestamp": 1456499379702,
		    	// 		"end_timestamp": 1456499414782,
		    	// 		"service_type": 0,
		    	// 		"window_location": "https://www.youtube.com/watch?v=_0gJoCTwt5A",
		    	// 		"current_src": "mediasource:https://www.youtube.com/0ea7bded-bc08-4a00-a412-ad9a33ce32b1",
		    	// 		"duration": 195.767437,
		    	// 		"title": "NBA Recap West vs East | February 14, 2016 | Highlights",
		    	// 		"end_reason": 0,
		    	// 		"qoe_score": "4",
		    	// 		"inBW": "1Mbit",
		    	// 		"inDelay": "0ms",
		    	// 		"inLoss": "0%",
		    	// 		"outBW": "1Mbit",
		    	// 		"outDelay": "0ms",
		    	// 		"outLoss": "0%",
		    	// 		"run": 0
		    	// 	}
		    	// ]
		    	if(json.VideoSessions.length != 1){
		    		file.status = 'errored'
		    		file.error_info = "The file must have only 1 session and it has " + json.VideoSessions.length
		    		return callback(file.error_info);
		    	}

		    	var vsess = json.VideoSessions[0]

		    	vsess.started_at 	= new Date(vsess.start_timestamp);
		    	vsess.ended_at   	= new Date(vsess.end_timestamp);
		    	vsess.qoe_score		= parseInt(vsess.qoe_score);

		    	vsess.file_id 		= file.id
		    	vsess.session_id	= session.id

		    	delete vsess.id
		    	delete vsess.inBW
		    	delete vsess.inDelay
		    	delete vsess.inLoss
		    	delete vsess.outBW
		    	delete vsess.outDelay
		    	delete vsess.outLoss
		    	delete vsess.run
		    	delete vsess.start_timestamp
		    	delete vsess.end_timestamp

		    	DB.insertOne('video_session',vsess,function(err,vsess_c){
		    		if(err){
		    			file.status = 'failed'
		    			file.error_info = "It was impossible to insert values to video_session table"
		    			return callback(file.error_info + ": " + err);
		    		}

		    		sails.log.info("Video session created with id: " + vsess_c.id)
		    		return callback(null,vsess_c);
		    	});
		    },

		    function createVideoResolution(video_session,callback){
		    	// "VideoResolutions": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"start_timestamp": 1456499379702,
		    	// 		"end_timestamp": 1456499393738,
		    	// 		"res_x": 640,
		    	// 		"res_y": 360,
		    	// 		"video_session": 0
		    	// 	}
		    	// ],
		    	var vres=[];
		    	var res;
		    	while(json.VideoResolutions.length > 0){
		    		res 					= json.VideoResolutions.shift();
		    		res.started_at 			= new Date(res.start_timestamp);
		    		res.ended_at   			= new Date(res.end_timestamp);

		    		res.video_session_id 	= video_session.id 

		    		delete res.start_timestamp
		    		delete res.end_timestamp
		    		delete res.id
		    		delete res.video_session

		    		vres.push(res);
		    	}

		    	DB.insert('video_resolution',vres,function(err,inserted_values){
		    		if(err) return callback(video_session)
		    		callback(null,video_session);
		    	});
		    },

		    function createVideoPlaybackQuality(video_session,callback){
		    	// "VideoPlaybackQualitySamples": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"t": 1456499381042,
		    	// 		"tvf": -1,
		    	// 		"dvf": -1,
		    	// 		"cvf": -1,
		    	// 		"tfd": -1,
		    	// 		"mprsf": -1,
		    	// 		"mdf": -1,
		    	// 		"mpf": -1,
		    	// 		"mpntf": -1,
		    	// 		"mfd": -1,
		    	// 		"video_session": 0
		    	// 	}
		    	// ]
		    	var vals=[];
		    	var val;
		    	while(json.VideoPlaybackQualitySamples.length > 0){
		    		val 						= json.VideoPlaybackQualitySamples.shift();
		    		val.logged_at				= new Date(val.t);
		    		val.totalvideoframes		= val.tvf
		    		val.droppedvideoframes		= val.dvf
		    		val.corruptedvideoframes	= val.cvf
		    		val.totalframedelay			= val.tfd
		    		val.mozparsedframes			= val.mprsf
		    		val.mozdecodedframes		= val.mdf
		    		val.mozpresentedframes		= val.mpf
		    		val.mozpaintedframes		= val.mpntf
		    		val.mozframedelay			= val.mfd
		    		val.video_session_id		= video_session.id

		    		delete val.id
		    		delete val.t;
		    		delete val.tvf
		    		delete val.dvf
		    		delete val.cvf
		    		delete val.tfd
		    		delete val.mprsf
		    		delete val.mdf
		    		delete val.mpf
		    		delete val.mpntf
		    		delete val.mfd
		    		delete val.video_session

		    		vals.push(val);
		    	}

				DB.insert('video_playback_quality_sample',vals,function(err,inserted_values){
					if(err) return callback(video_session)
					callback(null,video_session);
				});		    	

		    },

		    function createOffScreenEvents(video_session,callback){
		    	// TODO: I have no examples
		    	var vals=[];
		    	var val;


		    	// DB.insert('video_off_screen_event',vals,function(err,inserted_values){
	    		// 	if(err)	return callback(video_session)
		    	// 	callback(null,video_session);
		    	// });		

		    	callback(null,video_session)
		    },

		    function createBufferedPlayTime(video_session,callback){
		    	// "BufferedPlayTimeSamples": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"t": 1456499381042,
		    	// 		"cvpt": 0,
		    	// 		"bmc": 0,
		    	// 		"video_session": 0
		    	// 	}
		    	// ],
		    	var vals=[];
		    	var val;

		    	while(json.BufferedPlayTimeSamples.length > 0){
		    		val 						= json.BufferedPlayTimeSamples.shift();
		    		val.logged_at 				= new Date(val.t);
		    		val.current_video_playtime	= val.cvpt
		    		val.buffered_minus_current	= val.bmc
		    		val.video_session_id 		= video_session.id

		    		delete val.id
		    		delete val.t
		    		delete val.cvpt
		    		delete val.bmc
		    		delete val.video_session

		    		vals.push(val);


		    	}

		    	DB.insert('video_buffered_play_time_sample',vals,function(err,inserted_values){
		    		if(err) return callback(video_session)
		    		callback(null,video_session);
		    	});		
		    },

		    function createPlayerSize(video_session,callback){
		    	// "PlayerSizes": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"start_timestamp": 1456499379702,
		    	// 		"end_timestamp": 1456499414782,
		    	// 		"playerWidth": "1280px",
		    	// 		"playerHeight": "720px",
		    	// 		"isFullScreen": false,
		    	// 		"video_session": 0
		    	// 	}
		    	// ],
		    	var vals=[];
		    	var val;

		    	while(json.PlayerSizes.length > 0){
		    		val 						= json.PlayerSizes.shift();
		    		val.started_at 				= new Date(val.start_timestamp);
		    		val.ended_at   				= new Date(val.end_timestamp);
		    		val.width 					= parseInt(val.playerWidth.replace('px',''))
		    		val.height 					= parseInt(val.playerHeight.replace('px',''))
		    		val.is_full_screen			= val.isFullScreen?1:0;
		    		val.video_session_id 		= video_session.id

		    		delete val.id
		    		delete val.start_timestamp
		    		delete val.end_timestamp
		    		delete val.playerWidth
		    		delete val.playerHeight
		    		delete val.isFullScreen
		    		delete val.video_session

		    		vals.push(val);


		    	}

		    	DB.insert('video_player_size',vals,function(err,inserted_values){
		    		if(err) return callback(video_session)
		    		callback(null,video_session);
		    	});
		    },

		    function createBufferingEvents(video_session,callback){
		    	// "BufferingEvents": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"start_timestamp": 1456499379702,
		    	// 		"end_timestamp": 1456499382415,
		    	// 		"type": 1,
		    	// 		"ended_by_abort": false,
		    	// 		"video_session": 0
		    	// 	}
		    	// ]
		    	var vals=[];
		    	var val;

		    	json.buffering_events = [];

		    	while(json.BufferingEvents.length > 0){
		    		val 						= json.BufferingEvents.shift();
		    		val.started_at 				= new Date(val.start_timestamp);
		    		val.ended_at   				= new Date(val.end_timestamp);
		    		val.ended_by_abort 			= val.ended_by_abort?1:0;
		    		val.video_session_id 		= video_session.id

		    		json.buffering_events.push(Clone(val));	//Used later

		    		delete val.id
		    		delete val.start_timestamp
		    		delete val.end_timestamp
		    		delete val.video_session

		    		vals.push(val);
		    	}

		    	DB.insert('video_buffering_event',vals,function(err,inserted_values){
		    		if(err) return callback(video_session)
		    		callback(null,video_session);
		    	});
		    },

		    function createPauseEvents(video_session,callback){
		    	// "PauseEvents": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"start_timestamp": 1456499407533,
		    	// 		"end_timestamp": 1456499407867,
		    	// 		"type": 1,
		    	// 		"video_session": 0
		    	// 	}
		    	// ]
		    	var vals=[];
		    	var val;

		    	json.pause_events = [];
		    	while(json.PauseEvents.length > 0){
		    		val 						= json.PauseEvents.shift();
		    		val.started_at 				= new Date(val.start_timestamp);
		    		val.ended_at   				= new Date(val.end_timestamp);
		    		val.video_session_id 		= video_session.id

		    		json.pause_events.push(Clone(val)); //Used later

		    		delete val.id
		    		delete val.start_timestamp
		    		delete val.end_timestamp
		    		delete val.video_session

		    		vals.push(val);
		    	}

		    	DB.insert('video_pause_event',vals,function(err,inserted_values){
		    		if(err) return callback(video_session)
		    		callback(null,video_session);
		    	});
		    },
		    /*
		     * To create the SeekEvents it's necessary to determine the correct 
		     * database id from the inserted BufferingEvents and PauseEvents values,
		     * and relate that with the specified id in the json object.
		     */
		    function buildBufferingEventsDictionary(video_session,callback){
		    	DB.select('video_buffering_event',{video_session_id: video_session.id},function(err,result){
		    		if(err)	return callback(video_session)

		    		var dict = {};

		    		for(var i = 0; i < result.rows.length; i++){
		    			for(var j = 0; j < json.buffering_events.length; j++){
		    				var r = result.rows[i];
		    				var jo = json.buffering_events[j];
		    				if(r.started_at.toISOString() == jo.started_at.toISOString()
		    					&& r.ended_at.toISOString() == jo.ended_at.toISOString()
		    					&& r.ended_by_abort == jo.ended_by_abort){

		    					dict[jo.id] = r.id;

		    					break;
		    				}
		    			}
		    		}
		    		
		    		callback(null,video_session,dict)
		    	});
		    },
		    function buildPauseEventsDictionary(video_session,b,callback){
		    	DB.select('video_pause_event',{video_session_id: video_session.id},function(err,result){
		    		if(err)	return callback(video_session)

		    		var dict = {};

		    		for(var i = 0; i < result.rows.length; i++){
		    			for(var j = 0; j < json.pause_events.length; j++){
		    				var r = result.rows[i];
		    				var jo = json.pause_events[j];
		    				if(r.started_at.toISOString() == jo.started_at.toISOString()
		    					&& r.ended_at.toISOString() == jo.ended_at.toISOString()){

		    					dict[jo.id] = r.id;

		    					break;
		    				}
		    			}
		    		}

		    		callback(null,video_session,b,dict)

		    	});
		    },
		    function createSeekEvents(video_session,buf_dict,paus_dict,callback){
		    	// "SeekEvents": [
		    	// 	{
		    	// 		"id": 0,
		    	// 		"timestamp": 1456499408361,
		    	// 		"to_video_time": 193.1291,
		    	// 		"video_session": 0,
		    	// 		"buffering_event": 3,
		    	// 		"pause_event": 0
		    	// 	}
		    	// ]
		    	var vals=[];
		    	var val;

		    	while(json.SeekEvents.length > 0){
		    		val 						= json.SeekEvents.shift();
		    		val.logged_at 				= new Date(val.timestamp);
		    		val.video_session_id 		= video_session.id
		    		val.buffering_event_id 		= buf_dict[val.buffering_event]
		    		val.pause_event_id 			= paus_dict[val.pause_event]

		    		delete val.id
		    		delete val.timestamp
		    		delete val.video_session
		    		delete val.buffering_event
		    		delete val.pause_event

		    		vals.push(val);
		    	}

		    	DB.insert('video_seek_event',vals,function(err,inserted_values){
		    		if(err)	return callback(video_session)
		    		callback(null,video_session);
		    	});

		    }


		],
		function(err){
			if(err && 'id' in err) { //If it's a session
				DB.deleteRow('video_session',{id: err.id}, function(qerr,res){
					
					//This happen cause all the video_* tables has a ON DELETE CASCADE statement.
					sails.log.warn("All the information associated with this video session (id: " +  err.id + ") was deleted")


					file.status = 'failed'
					file.error_info = "There was some errors processing the video streaming JSON"
					return nextFunction(null)
				})
			}
		    else return nextFunction(err)
		});
	}
}