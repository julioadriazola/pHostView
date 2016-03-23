# FileProcessor.js

This is the *main* of the processing feature. All the _raw_ files will be processed in the next way:

1. An unprocessed file will be picked from the Database and the status will be changed to "processing"
2. Determine whether or not the file name extesion is supported for processing.
2. Base on the name of the file, determine whether or not the _parent_ exists. The parent is the object that creates the link with the session. For a sqlite file there's no parent (because it contains the session), for pcap files the parent is a connection, and for the rest the parent is a session.
3. If the parent exists, the file will be decompressed (No decompress action is made on the pcap files in this step).
4. The file will be processed depending on the type. For each type exists a service with a _process_ function.
5. Once the _process_ function ends, the FileProcessor.endProcess function will be called. This function will save the file (with a status different to "processing") and will perform some cleaning tasks. Finally, there will be a call to process another file.


# SQLiteProcessor.js

The process function of this service will perform the next tasks:

1. See whether or not a session exists in the session table of the sqlite.
2. Construct a session object with activity, powerstate, browseractivity, [...] and connections. The connections object has dns and http.
3. For each object type in the session, do a "cleaning" of the values (delete object.someAttribute. Each attribute will be mapped to a column of the same name in the insert, if there's a column that doesn't exist, the insertion will fail) and then insert the values to the database.
4. In case that something went wrong, the session object will be deleted of the database. Because the 'ON DELETE CASCADE' restriction, all the related information will be deleted too.
5. If it's all OK, call the FileProcessor.endProcess function.

Some considerations:

* The db.serialize will run all the code, and each db.each will be attached to a query BUT the query will not be executed immediately. For that reason, it's important not to process the results outside the db.each because the object will not exist. For example:
```javascript
//...
var db = new sqlite.Database(someFile);
var aNumber = null;
db.serialize(function(){
	q='Select 1 AS t';
	db.each(q,function(err,result){
		aNumber = result.t
	});

	console.log(aNumber); 				//It will print 'undefined' (or null, I'm not sure)

	db.each(q,function(err,result){
		console.log(aNumber);			//Anyway, the value will be available for the followings db.each. It will print '1'
	});
}); 
```

* The _table_ argument of the _insertIntoSessions_ function must be an attribute of the _session_ object and at the same time must be a valid tablename in the sqlite database. The same for the _insertIntoConnections_.
* The idea is that inside each function of a _async.waterfall_ the callback is called only one time. For that reason, the _runCallback_ function of the _createConnections_ function will determine wheter or not all the information was saved, and only then the callback will be called.



# JSONProcessor.js

In this case, the process function will perform the next tasks:

1. First read the JSON.
2. Depending on some values of the JSON, the file will be processed as a video (processVideo function) or as a pageload (not implemented yet).


### processVideo function

This functions works in a similar way to the SQLiteProcessor.process function, but the big difference is that in this case there's no need of build an equivalent to a session object, because the JSON file has all the structure. Another important difference here is that the seek events has foreign keys to 3 tables (included the video_session), so before processing this entity, it's necessary to build a dictionary that links the JSON buffering_event_id and pause_event_id with the id of the inserted values.


### processPageLoad function

TODO: NOT IMPLEMENTED YET 


# PCAP.js

In this case, the process function only execute the first step of the processing. In this case only _last_ pcap files parts are processed. First, it's important to understand the format of an uploaded pcap file. 

```javascript
var filename = '1456319539491_1456319542873_4_A2692622-D935-45DD-BC6A-0FEA4F88524C_last.pcap.zip';
var filename_parts = filename.split('_');

filename_parts[0];				//1456319539491:	It's the session start timestamp where the pcap was recorded
filename_parts[1];				//1456319542873:	It's the connection start timestamp where the pcap was recorded
parseInt(filename_parts[2]);	//4:				It's the index of the part starting from 0
filename_parts[3];				//A2692622...24C:	It's the identifier for the network card (Is like the mac)
filename_parts[4]; 				//last.pcap.zip:	Could be 'last' or 'part'.
```

An important point here is that for all related parts (i.e. from the same pcap) the session and connection timestamps, and the identifier of the network will be the same. Another important think is that **with the filename of the last part, it's easy to know how many parts the whole pcap has**, because it's the index + 1. The _process_ function works as follows:

1. Calls to DB function _selectPCAPParts_, that will split the filename and then it'll try to get all the parts with the same session timestamp, connection timestamp and identifier for the network card.
2. Then, the last part index + 1 will be compared with the numbers of pcap parts we've got from the _selecPCAPParts_. If the numbers don't match, the file will be marked as waitingFile and the FileProcessor.endProcess function will be called.
3. If the numbers match, a _pcap_ row will be inserted with an uploaded status and the _pcap\_file_ table will be filled. Finally, all the files involved (all the parts) will be marked as processed, and the FileProcessor.endProcess function will be called.

A second important function will be called from the schedules (config/schedule.js), that is the _processPCAP_ function. What it does is basically call the python processing function for the pcap files. This is the most resource consuming function, and when is called nothing will be displayed until the script finishes. To read more about this, see the [Pcap Processing](https://github.com/julioadriazola/pcapProcessing) repository.