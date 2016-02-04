var async = require('async'),
	fs = require('fs');


module.exports = {
	process: function(file){

        async.waterfall([
            function readJSON(callback){
                fs.readFile(file.unzipped,'utf8',function(err,data){
                    if (err) return callback(err);
                    return callback(null,JSON.parse(data));
                });
            },
            function createSurvey(doc,callback){

                var surv= {};
                surv.qoe = parseInt(doc.page2.QoE);
                surv.duration = doc.duration;
                surv.file_id = file.id;

                /*
                 * TODO: It's necessary to add started_at and ended_at instead duration
                 * duration attribute must be deleted from DB.
                 */
                DB.insertOne('surveys',surv,function(err,survey){
                	if(err) return callback(err);
                	return callback(null,doc,survey);
                })
            },
            function createPurposes(doc,survey,callback){

                /*
                 * TODO: Process file with new format.
                 */
                var purposes=[];
                for(var process in doc.page1){
                  for(var tag in doc.page1[process]){
                    if(tag.length >0 ){
                        var purpose= {};
                        purpose.survey_id = survey.id;
                        purpose.process_name = process;
                        purpose.tag_name = tag;
                        purposes.push(purpose);
                    }
                  }
                }

                DB.insert('survey_purpose_tags',purposes,function(err,inserted_values){
                	callback(null,doc,survey);
                });
            },
            function createProblems(doc,survey,callback){
                /*
                 * TODO: Process file with new format.
                 */
                var problems=[];
                for(var process in doc.page3){
                  for(var tag in doc.page3[process]){
                    if(tag.length >0 ){
                        var problem= {};
                        problem.survey_id = survey.id;
                        problem.process_name = process;
                        problem.tag_name = tag;
                        problems.push(problem);
                    }
                  }
                }

                DB.insert('survey_problem_tags',problems,function(err,inserted_values){
                	callback(null,doc,survey);
                });
            }
        ],
        function(err,survey,other){
            return FileProcessor.endProcess(err,file)
        });  
    }



}