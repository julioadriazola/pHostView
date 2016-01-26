module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'surveys',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},

		qoe:{
			type: 'integer'
		},

		file:{
			model: 'uploadedFile',
			columnName: 'file_id'
		},

		purposes:{
			collection: 'surveyPurpose',
			via: 'survey'
		},

		problems:{
			collection: 'surveyProblem',
			via: 'survey'
		},

		started_at:{
			type: 'datetime'
		},

		ended_at:{
			type: 'datetime'
		}

	},
	autoCreatedAt: false,
	autoUpdatedAt: false,
}
