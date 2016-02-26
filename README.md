# HostView application

The HostView application is compossed of 4 parts that are saved to 4 github repos:

* [Front End](https://github.com/julioadriazola/feHostView): It's a front-end application thought for the user. It contains information about the application, the latest installer, and it serves the `/latest/*` and `/location` resources used by the hostview windows application. In the future it should include a login part where user could see some stats and suggestions. **It runs in the muse server and is a nodejs application with sails framework**
* [Upload File](https://github.com/julioadriazola/HostView): It's in charge only of receive the files, save it locally and write some information to the device and file tables of the database. It's used by the hostview windows application. **It runs in the muse server and is a nodejs application with sails framework with --no-frontend option**
* [Process Files](https://github.com/julioadriazola/pHostView): It's in charge of process all the files. **It runs in the UCN server and is a nodejs application with sails framework with --no-frontend option**. All the actions performed by this part are called with a cronjob. It process:
	+ SQLite Files (*.db.zip): This type of files must be processed periodically because they have the session, a very important entity in the schema of the database (Without it is impossible to process the other files). It will feel mainly the tables without prefix.
	+ Survey Files (*_questionnaire.json.zip): It correspondens to the surveys responded by the user and includes the QoE value. It will fill the tables called with a _survey*_ prefix.
	+ Video Streaming (*.json.zip):  It corresponds to the files generated of monitoring the performance of the video (Youtube). It will fill the tables called with a _video*_ prefix.
	+ Pageload (*.json.zip): It corresponds to the file generated by the browser when it's monitoring the performance of the pages. It will fill the tables **TODO**. (**NOTE**: The Video Streaming and Pageload are diferenciated with an atribute in the JSON file, so it's neccesary to read it to know which it is).
	+ PCAP files (*.pcap.zip): The task performed in this case is to determine whether all the parts of a file have been uploaded or not. Once all the parts are uploaded, the file parts will be marked as 'processed' and the *pcap* and *pcap_file* tables will be filled. 
* [Pcap Processing](https://github.com/julioadriazola/pcapProcessing): It's the missing part for processing the pcap files. It takes a *pcap* marked as 'uploaded', join its parts, and then runs the tcptrace over the merged file. It will fill the other tables called with a _pcap*_ prefix. **It runs in the UCN server and is a python application**. This function is called by a cronjob.

# General configuration

There are two languages combined, so I thought that was necessary to establish a unique point to pick the environment variables. For that, it's necessary the next:

* Create a configuration file: *~/.set_envs* with the next content:
```bin
#Production variables
export PROD_DATABASE_USER=value
export PROD_DATABASE_PASSWORD=value
export PROD_DATABASE_SERVER=value
export PROD_DATABASE_PORT=value
export PROD_DATABASE_NAME=value
export PROD_TCPTRACE_BIN=value 					#It's used in the python code
export PROD_PROCESS_FOLDER=value				#It's used in the python code

export DEV_DATABASE_USER=value
export DEV_DATABASE_PASSWORD=value
export DEV_DATABASE_SERVER=value
export DEV_DATABASE_PORT=value
export DEV_DATABASE_NAME=value
export DEV_TCPTRACE_BIN=value
export DEV_PROCESS_FOLDER=value
```
* Add to the *~/.bashrc* the next lines:
```bin
if [ -f ~/.set_envs ]; then
    . ~/.set_envs
fi
```

* In nodejs you can use the variables with `process.env.VARIABLE_NAME`
* In python you can use the variables with `os.environ.get("VARIABLE_NAME")` (It's necessary to import os before)



# Database Schema

The general purpose of each table is explained in the front-end application. In this case, here 
is the explanation of the tables directly related to a back-end database decision.


### files ###
	
It's generated when the HostView front-end application uploads a file. This entity represents

a raw file data, so it's basically metadata.

The important fields are:


	file_path: 

		Contains the absolute path to the raw file, that it's a zipped file.
	

	status: Can be uploaded|processing|typeNotfound|waitingParent|waitingFile|failed|errored|skipped|processed


		uploaded: The file was uploaded and it's ready to be processed.

		processing:	For concurrency, to guarantee that the file is processed only once.
		It's important to check that the files always pass from this status to another one.

		typeNotfound: The file name isn't valid so it's not possible to determine what kind 
		of file is and how to process it.

		waitingParent: The corresponding session or connection (It's taken from the file 
		name, i.e. "123456789_..." corresponds to a session with start timestamp = 123456789,
		and it's similar in the case of connections) doesn't exist yet, so it's necessary
		to wait for him before process the file.		

		waitingFile: The file is not synchronized yet to UCN server, or there's some problem
		not associated with the content of the file, but the file itself (File doesn't exist or
		cannot be readed, or unzipped file was not found, for example).

		failed: There was some error processing the file not associated with the file, for
		example, it was not possible to query or insert values to database.

		errored: There was some error directly related to the content, for example, an 
		entity or attribute missing, or a malformed json. In this case the file will
		never be processed again.

		skipped: It's used only in two cases. First, when we don't want to process something, like
		the log files. And second, we want to process the PCAP file only once, so the _parts_ are 
		skipped from processing, and we can try to process the whole file once we have the last one, 
		so only the _last part_ is marked as uploaded.

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

It represents an entire processable pcap file. This pcap object must be created only once

all the parts of the pcap file were uploaded.

The important field is:


	status: Can be uploaded|processing|failed|errored|processed, and they represent the same as

	in the _files_ table, but for the whole pcap file.

	pcap_file.file_id[]: It's explained below.



### pcap_file ###

It's not possible in PostgreSQL to create an array with foreign key constraint, so, it's necessary

this table to create the association between files and pcap object. All the ordered files of a

pcap_id represent the raw parts of it, which must be 'joined' before execute the tcptrace script.




### About the associations with sessions ###

All the events (Understanding that as some record in time) must happen when HostView is running

and recording, i.e. during a session. For that reason, all the tables (except locations, devices

and files) must be related directly or indirectly to a session object.
 