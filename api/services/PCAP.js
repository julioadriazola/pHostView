var async = require('async'),
	path = require("path");

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

			sails.log.info('PCAP PARTS:');
			sails.log.info(result.rows);

			// var numberOfParts= parseInt(file.basename.split('_')[2]);				//TODO: It must work in the new version that has the part number instead of timestamp

			if(true || numberOfParts == result.rows.length){ //Parts must be in order	//TODO: Delete 'true ||'

				var parts = [ {id: 1}, {id: 100}, {id: 2}, {id: 101}, {id: 7}] 			//TODO: Replace it by result.rows

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
	}
}