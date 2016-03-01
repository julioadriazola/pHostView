var async = require('async'),
	path = require("path"),
    PyShell = require('python-shell');

module.exports = {
	process: function(file,connection){
		DB.selectPCAPParts(file, function(err,result){
			if(err){
				file.status = 'failed'
				file.error_info = "There's some error trying to get parts of pcap: " + path.basename(file.file_path)
				return FileProcessor.endProcess(err,file);
			}

			if(result.rows.length == 0){
				file.status = 'failed'
				file.error_info = "There's no parts (?) for pcap: " + path.basename(file.file_path)
				return FileProcessor.endProcess(null,file);
			}

			// Last par will see as follow:
			// 1456319539491_1456319542873_4_A2692622-D935-45DD-BC6A-0FEA4F88524C_last.pcap.zip
			// The third 'argument' will give us the position of this part starting from 0.
			// So, from the last part we can obtain the total number of parts.

			var numberOfParts= parseInt(file.basename.split('_')[2]) + 1;

			if(numberOfParts == result.rows.length){
				var parts = result.rows;

				DB.createCompletePCAP(parts,connection,function(err){
					if(err){
						file.status = 'failed'
						file.error_info = "Something went wrong trying to create a complete PCAP object (pcap and pcap_file)"
						return FileProcessor.endProcess(err,file);
					}
					return FileProcessor.endProcess(null,file);
				});
			}
		});
	},

	resetPcap: function(){
	    DB.resetEntity('pcap',['waitingFile','waitingParent','failed','typeNotfound'],function(err,res){
	        if(err) sails.log.error("There was some error updating pcaps: " + err)
	    })
	},

	processPcap: function(){
	    PyShell.run(sails.config.pcapProcessing.script,sails.config.pcapProcessing.options,function(err, res){
	        if(err) sails.log.error(err);
	        if(res) for(var i=0; i < res.length; i++) sails.log(res[i]);
	    })
	    // cmd = `cd /home/julio/pcapProcessing && /usr/bin/python -c "import os; os.environ['RUNNING_ENV'] = 'DEV'; import helper; helper.Helper.resetPcap();"`;
	    // child_process.exec(cmd,
	    //                     { cwd: '/home/julio/pcapProcessing'},
	    //                     function(err,stdout,stderr){
	    //                         if(err) sails.log.error(err);
	    //                         sails.log(stdout);
	    //                         sails.log(stderr);
	    //                     });
	}
}