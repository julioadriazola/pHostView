module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'survey_purpose_tags',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},
		
		tag:{
			type: 'string',
			columnName: 'tag_name',
			size: 260
		},

		process:{
			type: 'string',
			columnName: 'process_name',
			size: 260
		},

		survey:{
			model: 'survey',
			columnName: 'survey_id'
		}

	},
	autoCreatedAt: false,
	autoUpdatedAt: false
}
