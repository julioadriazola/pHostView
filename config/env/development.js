/**
 * Development environment settings
 *
 * This file can include shared settings for a development team,
 * such as API keys or remote database passwords.  If you're using
 * a version control solution for your Sails app, this file will
 * be committed to your repository unless you add it to your .gitignore
 * file.  If your repository will be publicly viewable, don't add
 * any private information to this file!
 *
 */

module.exports = {

  /***************************************************************************
   * Set the default database connection for models in the development       *
   * environment (see config/connections.js and config/models.js )           *
   ***************************************************************************/

  // models: {
  //   connection: 'someMongodbServer'
  // }

};



/*
 * The next piece of code is for disabling blueprints:
 *
 *
 * For more information on the blueprint API, check out:
 * http://sailsjs.org/#!/documentation/reference/blueprint-api
 *
 * For more information on the settings in this file, see:
 * http://sailsjs.org/#!/documentation/reference/sails.config/sails.config.blueprints.html
 */
module.exports.blueprints = { actions: false, rest: false, shortcuts: false };
module.exports.models= { migrate: 'safe'} ;
module.exports.policies = { '*' : false }; //No access to any resource.

module.exports.connections = { //All-access-granted connection
  postgreSQLDatabase: {
   adapter: 'sails-postgresql',
   host: 'localhost',
   user: 'julio',
   password: '123123123',
   database: 'test',
   port: 5432
  },
 }