module.exports = {

	connection: 	'postgreSQLDatabase',
	tableName: 		'connections',
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

		name: {
			type: 'string',
			size: 260
		},

		friendly_name: {
			type: 'string',
			size: 260
		},

		description: {
			type: 'string',
			size: 260
		},

		dns_suffix: {
			type: 'string',
			size: 260
		},

		mac: {
			type: 'string',
			size: 64
		},

		ips: {
			type: 'string',
			size: 300
		},

		gateways: {
			type: 'string',
			size: 300
		},

		dnses: {
			type: 'string',
			size: 300
		},

		t_speed:{
			type: 'integer'
		},

		r_speed:{
			type: 'integer'
		},

		wireless:{
			type: 'integer'
		},

		profile: {
			type: 'string',
			size: 64
		},

		ssid: {
			type: 'string',
			size: 64
		},

		bssid: {
			type: 'string',
			size: 64
		},

		bssid_type: {
			type: 'string',
			size: 20
		},

		phy_type: {
			type: 'string',
			size: 20
		},

		phy_index:{
			type: 'integer'
		},

		channel:{
			type: 'integer'
		},

		connected:{
			type: 'integer'
		},

		session:{
			model: 'session',
			columnName: 'session_id'
		},

		/*
		 * Location fields -->
		 */
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
		}

		/*
		 * <-- Location fields
		 */

	},
	autoCreatedAt: false,
	autoUpdatedAt: false
}
