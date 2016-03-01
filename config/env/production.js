/**
 * Production environment settings
 *
 * This file can include shared settings for a production environment,
 * such as API keys or remote database passwords.  If you're using
 * a version control solution for your Sails app, this file will
 * be committed to your repository unless you add it to your .gitignore
 * file.  If your repository will be publicly viewable, don't add
 * any private information to this file!
 *
 */

module.exports = {

  /***************************************************************************
   * Set the default database connection for models in the production        *
   * environment (see config/connections.js and config/models.js )           *
   ***************************************************************************/

  // models: {
  //   connection: 'someMysqlServer'
  // },

  /***************************************************************************
   * Set the port in the production environment to 80                        *
   ***************************************************************************/

  // port: 80,

  /***************************************************************************
   * Set the log level in production environment to "silent"                 *
   ***************************************************************************/

  // log: {
  //   level: "silent"
  // }

};

module.exports.blueprints = { actions: false, rest: false, shortcuts: false };
module.exports.models= { migrate: 'safe'} ;
module.exports.policies = { '*' : false }; //No access to any resource.

module.exports.connections = { //User can CRUD over devices, and can write into files table.
 postgreSQLDatabase: {
  host: (process.env.PROD_DATABASE_SERVER || ''),
  user: (process.env.PROD_DATABASE_USER||''),
  password: (process.env.PROD_DATABASE_PASSWORD||''),
  database: (process.env.PROD_DATABASE_NAME||''),
  port: (process.env.PROD_DATABASE_PORT||'')
 },
}


module.exports.pcapProcessing = {
  options:{
    pythonPath: '/usr/bin/python',
    scriptPath: '/home/jadriazo/pcapProcessing'
  },
  script: 'PROD.py'
}