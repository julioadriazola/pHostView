var async = require('async'),
	fs = require('fs');


module.exports = {
	process: function(file, session){

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
                surv.session_id = session.id;

                /*
                 * TODO: It's necessary to add started_at and ended_at instead duration
                 * duration attribute must be deleted from DB.
                 */
                DB.insertOne('surveys',surv,function(err,survey){
                    if(err){
                        file.status = 'failed'
                        file.error_info = "It was impossible to insert values to surveys table"
                        return callback(file.error_info + ": " + err);
                    }

                    sails.log.info("Survey created with id: " + survey.id)
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
                    if(err) return callback(survey)
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
                    if(err) return callback(survey)
                	callback(null,doc,survey);
                });
            }
        ],
        function(err){
            if(err && err.id) { //If it's a survey
                DB.deleteRow('surveys',{id: err.id}, function(qerr,res){
                    
                    //This happen cause all the survey_* tables has a ON DELETE CASCADE statement.
                    sails.log.warn("All the information associated with this survey (id: " +  err.id + ") was deleted")


                    file.status = 'failed'
                    file.error_info = "There was some errors processing the survey file"

                    return FileProcessor.endProcess(null,file)
                })
            }
            else return FileProcessor.endProcess(err,file)
        });  
    }



}