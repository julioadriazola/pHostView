/**
 * Created by jaumard on 27/02/2015.
 */
module.exports.schedule = {
    sailsInContext : true, //If sails is not as global and you want to have it in your task
    tasks          : {

         runSQLite : {
             cron : "15 1-5,11-23 * * *",
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
         resetPcapFiles : {
             cron : "25 5 * * *",
             task : function ()
             {
                PCAP.resetPcap();
             }
         },
         processPcapFiles : {
             cron : "30 5 * * *",
             task : function ()
             {
                PCAP.processPcap();
             }
         },


    }
};
