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
                sails.log.info("runSQLite task fired");
                FileProcessor.resetSQLiteFiles()
                FileProcessor.processOneSQLiteFile();
             }
         },
         resetOtherFiles : {
             cron : "25 * * * *",
             // cron : "25 3 * * *",
             task : function ()
             {
                sails.log.info("resetOtherFiles task fired");
                FileProcessor.resetFiles();
             }
         },
         runOtherFiles : {
             cron : "30 * * * *",
             // cron : "30 3 * * *",
             task : function ()
             {
                sails.log.info("runOtherFiles task fired");
                FileProcessor.processOneFile();
             }
         },
         resetPcapFiles : {
             cron : "40 * * * *",
             // cron : "25 5 * * *",
             task : function ()
             {
                sails.log.info("resetPcapFiles task fired");
                PCAP.resetPcap();
             }
         },
         processPcapFiles : {
             cron : "45 * * * *",
             // cron : "30 5 * * *",
             task : function ()
             {
                sails.log.info("processPcapFiles task fired");
                PCAP.processPcap();
             }
         },


    }
};
