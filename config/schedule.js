/**
 * Created by jaumard on 27/02/2015.
 */
module.exports.schedule = {
    sailsInContext : true, //If sails is not as global and you want to have it in your task
    tasks          : {
        // /*Every monday at 1am
         runSQLite : {
             cron : "15 * * * *",
             task : function ()
             {
                FileProcessor.processOneSQLiteFile();
             }
         },
         resetOtherFiles : {
             cron : "25 3 * * *",
             task : function ()
             {
                FileProcessor.resetFiles();
             }
         },
         runOtherFiles : {
             cron : "30 3 * * *",
             task : function ()
             {
                FileProcessor.processOneFile();
             }
         },

    }
};
