var util = require('util'),
	pgbricks = require('pg-bricks'),
	async = require('async');

var pgsql = null
var MAX_INSERT = 10000;

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
	 * by only one thread, at the same time that one thread works with only one file.
	 * Picks every type of file excepto SQLite.
	 */

	nextFileToProcess: function(nextFunction){
		if(!pgsql) DB.start();

		pgsql.transaction(function(client,callback){
			async.waterfall([

				client.select('*').from('files').where(pgsql.sql.and({'status': 'uploaded'},pgsql.sql.not(pgsql.sql.like('basename','%stats.db%')))).limit(1).run,

				function markFileAsProcessing(files,callback){
					if(files.rows.length == 0) return sails.log.warn('Nothing to process');
					sails.log(files.rows[0].basename)

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
	 * This function includes transactions. The idea is that one file can be picked
	 * by only one thread, at the same time that one thread works with only one file.
	 * Picks only SQLite files.
	 */

	nextSQLiteFileToProcess: function(nextFunction){
		if(!pgsql) DB.start();

		pgsql.transaction(function(client,callback){
			async.waterfall([

				client.select('*').from('files').where(pgsql.sql.and({'status':'uploaded'},pgsql.sql.like('basename','%stats.db%'))).limit(1).run,
					// "status = 'uploaded' AND file_path LIKE '%stats.db%'"

				function markFileAsProcessing(files,callback){
					if(files.rows.length == 0) return sails.log.warn('Nothing to process');
					sails.log(files.rows[0].basename)

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

    	if(values.length > MAX_INSERT){
            var insertNow   = values.slice(0,MAX_INSERT)
            var insertNext  = values.slice(MAX_INSERT+1,values.length);
            pgsql.insert(table,insertNow).returning('*').rows(function(err,inserted_values){
                if(err) sails.log.error("There's some error inserting "+ table +": " + err);
                else {
                    if(inserted_values.length == 1)
                        sails.log.info('Rows inserted in table '+table+': ' + inserted_values.length + ' (id: ' + inserted_values[0].id + ')')
                    else
                        sails.log.info('Rows inserted in table '+table+': ' + inserted_values.length + ' (ids: ' + inserted_values[0].id + '-' + inserted_values[inserted_values.length - 1].id + ')')
                }

                DB.insert(table,insertNext,nextFunction);
            });
        }
        else if (values.length > 0)
	    	pgsql.insert(table,values).returning('*').rows(function(err,inserted_values){


	    		if(err) sails.log.error("There's some error inserting "+ table +": " + err);
	    		else {
                    if(inserted_values.length == 1)
                        sails.log.info('Rows inserted in table '+table+': ' + inserted_values.length + ' (id: ' + inserted_values[0].id + ')')
                    else
                        sails.log.info('Rows inserted in table '+table+': ' + inserted_values.length + ' (ids: ' + inserted_values[0].id + '-' + inserted_values[inserted_values.length - 1].id + ')')
                }


	    		
	    		if(nextFunction) nextFunction(err,inserted_values);
	    	});
	    else {
	    	sails.log.info("Nothing to insert into " + table);
	    	if(nextFunction) nextFunction(false,[]);
	    }
    },

    /*
     * Insert one value in a table and return the row object created.
     * A third parameter is passed so when you execute createOneIfNotExist
     * you can know if it's a new row or an existing one.
     */
    insertOne: function(table,value,nextFunction){
    	if(!pgsql) DB.start();
    	if(value) pgsql.insert(table,value).returning('*').row(function(err,row){
    		nextFunction(err,row,true);
    	});
    	else sails.log.error("Nothing to insert into " + table);
    },

    /*
     * Simple select for unique stuffs like id.
     * It will return the first row that matches the value object.
     * The value object must be a valid object for pg-bricks where method. 
     */
    selectOne: function(table,value,nextFunction){
    	if(!pgsql) DB.start();

    	pgsql.select('*').from(table).where(value).limit(1).run(function(err,query_result){
    		if(query_result && query_result.rows.length == 1) nextFunction(err,query_result.rows[0]);
    		else nextFunction(err);
    	});
    },

    select: function(table,value,nextFunction){
    	if(!pgsql) DB.start();

    	pgsql.select('*').from(table).where(value).run(nextFunction);
    },

    /*
     * Select all the parts of a pcap from the basename of one part.
     */
    selectPCAPParts: function(file,nextFunction){
    	if(!pgsql) DB.start();

        // 0             1             2  3                                    4
        // session       connection    #  interface_id                         sufix   
        // 1456320420964_1456320421042_10_A2692622-D935-45DD-BC6A-0FEA4F88524C_part.pcap.zip
        var sb = file.basename.split('_')
    	var base = '%' + sb[0] + '_' + sb[1] + '_%_' + sb[3] + '%' 
    	pgsql.select('*')
            .from('files')
            .where(pgsql.sql.and({'device_id': file.device_id},pgsql.sql.like('basename',base)))
            .order("cast(split_part(basename,'_',3) as integer) ASC")
            .run(nextFunction)
    },

    deleteRow: function(table,value,nextFunction){
        if(!pgsql) DB.start();

        pgsql.delete(table).where(value).rows(nextFunction);
    },

    /*
     * Must be inserted All or nothing.
     */
    createCompletePCAP: function(parts,connection,nextFunction){

    	var pcap = {
    		connection_id: 	connection.id,
    		status: 		'uploaded',
    	}

    	pgsql.transaction(function(client,callback){
    		async.waterfall([

    			client.insert('pcap',pcap).returning('*').row,

    			function addFilesToPCAP(pcap,callback){
    				if(!pcap) return callback("There's some problem inserting values to pcap table");

    				sails.log.info('PCAP inserted with id: ' + pcap.id)

    				var inserts= []
    				var insert = {}
    				for(var i = 0; i < parts.length; i++){
    					insert = {}
    					insert.pcap_id = pcap.id;
    					insert.file_id = parts[i].id;
    					insert.file_order = i+1;

    					// sails.log(insert.pcap_id + ',' + insert.file_id + ',' + insert.file_order)

    					inserts.push(insert);
    				}

					client.insert('pcap_file',inserts).returning('*').rows(callback)
    			},

    			function markFilesAsProcessed(pcap_files,callback){
    				if(!pcap_files) return callback("There's some problem inserting values to pcap_file table");

    				sails.log.info('Rows inserted in table pcap_file: ' + pcap_files.length)

    				var fileIds = [];
    				for(var i = 0; i < pcap_files.length; i++){
    					fileIds.push(pcap_files[i].file_id);
    				}

    				client.update('files',{status: 'processed',updated_at: new Date()}).where(pgsql.sql.in('id',fileIds)).run(callback)
    			}
    		],
    		callback);
    	}, nextFunction)
    },

    resetEntity: function(table,where,nextFunction){
        if(!pgsql) DB.start();

        if(table=='SQLiteFiles')
            pgsql
                .update('files',{status: 'uploaded',updated_at: new Date()})
                .where(pgsql.sql.and(pgsql.sql.like('basename','%stats.db%'),pgsql.sql.in('status',where)))
                .run(nextFunction);
        else pgsql
                .update(table,{status: 'uploaded',updated_at: new Date()})
                .where(pgsql.sql.in('status',where))
                .run(nextFunction);
    },


    /*
     * Find if a sepecific value exists in the table specified. If not, it will be created.
     * Then, return that value.
     * A third argument is passed (true) if the result is a new row.
     */
    createOneIfNotExist: function(table,value,nextFunction){
    	DB.selectOne(table,value,function(err,result){
    		if(err) nextFunction(err);
    		else if(result) nextFunction(err,result);
			else DB.insertOne(table,value,nextFunction);
    	});
    },

    existsObject: function(table,value,nextFunction){
    	DB.selectOne(table,value,function(err,el){
    		if(err) nextFunction(err);
    		else if(result) nextFunction(err,result)
    		else (err,null)
    	});
    }

}