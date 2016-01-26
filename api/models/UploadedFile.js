module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'files',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},

		file_path:{
			type: 'string',
			size: 260
		},
		
		status:{
			type: 'string',
			size: 100
		},

		created_at:{
			type: 'datetime'
		},

		updated_at:{
			type: 'datetime'
		},

		device:{
			model: 'device',
			columnName: 'device_id',
			required: true
		},

		hostview_version:{
			model: 'version',
			columnName: 'hostview_version_id',
			required: true
		},
	},
	autoCreatedAt: false,
	autoUpdatedAt: false


}