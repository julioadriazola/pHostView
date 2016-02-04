/*
 * Location is an existing object in javascript.
 * So, I prefer to call it on the framework IPLocation.
 * Anyway, it's called locations in the db.
 */
module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'locations',
	attributes:{
		id: {
			type: 			'integer',
			primaryKey: 	true,
			autoIncrement: 	true,
			unique: 		true
		},

		ip: {
			type: 'string',
			size: 100
		},

		rdns: {
			type: 'string',
			size: 100
		},

		asn_number: {
			type: 'string',
			size: 100
		},

		asn_name: {
			type: 'string',
			size: 100
		},

		country_code: {
			type: 'string',
			size: 100
		},

		city: {
			type: 'string',
			size: 100
		},

		latitude: {
			type: 'string',
			size: 100
		},

		longitude: {
			type: 'string',
			size: 100
		},

		loged_at:{
			type: 'datetime'
		}

	},
	autoCreatedAt: false,
	autoUpdatedAt: false
}
