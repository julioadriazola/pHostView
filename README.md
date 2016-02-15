# processFileHostView

a [Sails](http://sailsjs.org) application

# Database Schema

The general purpose of each table is explained in the front-end application. In this case, here 
is the explanation of the tables directly related to a back-end database decision.




### files ###
	
It's generated when the HostView front-end application uploads a file. This entity represents

a raw file data, so it's basically metadata.

The important fields are:


	file_path: 

		Contains the absolute path to the raw file, that it's a zipped file.
	

	status: Can be uploaded|processing|waitingFile|failed|errored|skipped|processed


		uploaded: The file was uploaded and it's ready to be processed.

		processing:	For concurrency, to guarantee that the file is processed only once.
		It's important to check that the files always pass from this status to another one.

		waitingFile: The file is not synchronized yet to UCN server, or there's some problem
		not associated with the content of the file, but the file itself (File doesn't exist or
		cannot be readed, or unzipped file was not found, for example).

		failed: There was some error processing the file not associated with the file, for
		example, it was not possible to query or insert values to database.

		errored: There was some error directly related to the content, for example, an 
		entity or attribute missing, or a malformed json. In this case the file will
		never be processed again.

		skipped: For the moment, it's only used for PCAP files. We want to process the PCAP file 
		only once, so the _parts_ are skipped from processing, and we can try to process the whole 
		file once we have the last one, so only the _last part_ is marked as uploaded.

		processed: The file was processed without errors. In the case of pcap files it means that
		the pcap table was filled with a new row and the it's ready to be processed.

	error_info: It's useful to specify reasons about the uncompleted processing of the file,
	so it's not necessary to see the logs.




### devices ###

It corresponds to the device that is uploading files. The idea in the future is to have a _user_

table and that user could have a lot of devices. For that reason this information is not saved 

directly to the _files_ table.




### sessions ###

It's the same as the front-end session, so they're constructed from the SQLite files. The unique

difference is that from two rows in the SQLite file must be constructed an only row in the

back-end in the way that they're intervals instead a point in time.




### connections ###

It's the same as the front-end connectivity, so they're constructed from the SQLite files. Here

exists the same difference mentioned for the _sessions_ table.




### pcap ###

It represents an entire processable pcap file. The main attribute is the files_id[] array, that

contains an ordered array of raw parts of pcap files. This pcap object must be created only once

all the parts of the pcap file were uploaded.

The important fields are:

	files_id[]: An array with ordered raw parts of pcap files.

	status: Can be uploaded|processing|failed|errored|processed, and they represent the same as

	in the _files_ table, but for the whole pcap file.




### About the associations with sessions ###

All the events (Understanding that as some record in time) must happen when HostView is running

and recording, i.e. during a session. For that reason, all the tables (except locations, devices

and files) must be related directly or indirectly to a session object.
 