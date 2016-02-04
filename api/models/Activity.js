module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'activities',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},

		user: {
			type: 'string',
			size: 260,
			columnName: 'user_name'
		},

		pid:{
			type: 'integer'
		},

		name: {
			type: 'string',
			size: 260
		},

		description: {
			type: 'string',
			size: 260
		},

		fullscreen:{
			type: 'integer'
		},

		idle:{
			type: 'integer'
		},

		loged_at:{
			type: 'string'
		},

		session:{
			model: 'session',
			columnName: 'session_id'
		}
	},
	autoCreatedAt: false,
	autoUpdatedAt: false
}
