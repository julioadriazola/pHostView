/**
 * Created by jaumard on 27/02/2015.
 */
module.exports.schedule = {
    sailsInContext : true, //If sails is not as global and you want to have it in your task
    tasks          : {
        // /*Every monday at 1am
         firstTask : {
             cron : " * * * * *",
             task : function ()
             {
                FileProcessor.processOneFile();
             }
         }
    }
};
