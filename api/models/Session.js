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
		
		// device_id:{
		// 	type: 'string',
		// 	size: 260
		// },

		// device_name:{
		// 	type: 'string',
		// 	size: 260
		// },
		
		started_at:{
			type: 'datetime'
		},

		ended_at:{
			type: 'datetime'
		},

		file:{
			model: 'uploadedFile',
			columnName: 'file_id'
		},

	},
	autoCreatedAt: false,
	autoUpdatedAt: false,


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
