var util = require('util'),
	pgbricks = require('pg-bricks'),
	async = require('async');

var pgsql = null

/*
 * I prefered to use pg-bricks instead the Waterline (sails) libray because I had some weird problems
 * that it's hard to explain and understand. 
 * pg-bricks makes thinks easier and simpler, and it's not necessary to maintain the api/models/* code.
 *
 * The only "big" disadvantage is that it's not possible to have more attributes in the object than
 * the specified in the db schema for select, update, insert... For example if you want to insert an
 * object A that has an A.isNotATableAttribute you MUST specify in the code before insert something like:
 * 		delete A.isNotATableAttribute;
 *
 * This is the reason why there's a lot of 'delete stuff' in all the services before insert or update
 * something in the DB.
 */

module.exports = {

	start: function(){

		if(!sails.config.connections.postgreSQLDatabase) return sails.log.error('Impossible to connect to the database: You must specify the postgreSQLDatabase connection.');

		this.dburl = util.format('postgres://%s:%s@%s/%s',
				sails.config.connections.postgreSQLDatabase.user,
				sails.config.connections.postgreSQLDatabase.password,
				sails.config.connections.postgreSQLDatabase.host+':'+sails.config.connections.postgreSQLDatabase.port,
				sails.config.connections.postgreSQLDatabase.database
			);

		sails.log.info("Connected to database: " + this.dburl);
		pgsql = pgbricks.configure(this.dburl);
	},

	/*
	 * This function includes transactions. The idea is that one file can be picked
	 * by only one thread, at the same time that one thrads works with only one file.
	 */

	nextFileToProcess: function(nextFunction){
		if(!pgsql) DB.start();

		pgsql.transaction(function(client,callback){
			async.waterfall([

				client.select('*').from('files').where('status','uploaded').limit(1).run,

				function markFileAsProcessing(files,callback){
					if(files.rows.length == 0) return sails.log.info('Nothing to process');

					var file= files.rows[0];
					file.status = 'processing';
					file.updated_at=new Date();

					client.update('files', file).where('id',file.id).run(function(err){
						if(err) return callback(err);
						callback(null,file);
					});
				}
			],
			callback);
		}, nextFunction)
	},

	/*
	 * This function doesn't include transactions, so it's used for change the status
	 * after it's marked as a "processing" file.
	 */
	updateFile: function(file,nextFunction){
		if(!pgsql) DB.start();
		file.updated_at = new Date();
		pgsql.update('files',file).where('id',file.id).run(nextFunction);
	},

    insert: function(table, values, nextFunction){
    	if(!pgsql) DB.start();

    	if(values.length>0)
	    	pgsql.insert(table,values).returning('*').rows(function(err,inserted_values){


	    		if(err) return sails.log.error("There's some error inserting "+ table +": " + err);
	    		sails.log.info('Rows inserted in table '+table+': ' + inserted_values.length + ' (' + inserted_values[0].id + '-' + inserted_values[inserted_values.length - 1].id + ')');


	    		
	    		if(nextFunction) nextFunction(err,inserted_values);
	    	});
	    else {
	    	sails.log.info("Nothing to insert into " + table);
	    	if(nextFunction) nextFunction(false,[]);
	    }
    },

    insertOne: function(table,value,nextFunction){
    	if(!pgsql) DB.start();

    	if(value) pgsql.insert(table,value).returning('*').row(nextFunction);
    	else sails.log.error("Nothing to insert into " + table);
    },

    selectOne: function(table,value,nextFunction){
    	if(!pgsql) DB.start();

    	pgsql.select('*').from(table).where(value).limit(1).run(nextFunction);
    },



}