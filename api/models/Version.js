module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'hostview_versions',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},

		name:{
			type: 'string',
			size: 30
		},
		
		description:{
			type: 'string',
			unique: true
		},

		file_path:{
			type: 'string',
			size: 260
		},

		released_at:{
			type: 'datetime'
		},

		uploaded_files: {
			collection: 'uploadedFile',
			via: 'hostview_version'
		}

	},
	autoCreatedAt: false,
	autoUpdatedAt: false


}