/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as urls from './urls.js';
import {logger} from './logger.js';
import {MDBE_AUTHZ_FAILED} from './exceptions.js';
import mongo from 'mongodb';
import semver from 'semver';
import {klona} from 'klona';

const {MongoClient} = mongo;
const {util: {BedrockError}} = bedrock;

export async function openDatabase(options) {
  // copy the config so we don't mutate something while connecting
  const config = klona(bedrock.config.mongodb);
  // copy the config stuff related to connecting
  const opts = {
    database: config.name,
    authentication: config.authentication,
    // authSource should be set in connectOptions
    connectOptions: config.connectOptions,
    writeOptions: config.writeOptions,
    ...options
  };

  // if a `url` was not specified, create one from the `config`
  if(!opts.url) {
    opts.url = config.url = urls.create(config);
  }
  // do unauthenticated connection to mongo server to check
  // server compatibility and authn requirements
  const {admin} = await _getUnauthenticatedDb({options: opts});
  const serverInfo = await admin.serverInfo(null);
  _checkServerVersion({serverInfo, config});

  // makes an unauthenticated call to the server
  // to see if auth is required
  const authRequired = await _isAuthnRequired({config, admin});

  // if authRequired create an auth object for Mongo;
  // otherwise `auth` will be passed as `null` and success will rely on other
  // config options such as the url for the server
  if(authRequired) {
    _addAuthOptions({options: opts, config});
  }

  // connect to database and get server info
  return _connect(opts);
}

/**
 * Connects to the database with authentication if provided.
 *
 * @private
 * @param {object} options - Connection options.
 *
 * @returns {Promise<object>} Returns the client & db.
 */
async function _connect(options) {
  if(!options.init) {
    logger.info('connecting to database: ' + urls.sanitize(options.url));
  }
  const {writeConcern} = options.writeOptions;
  let connectOptions = {...options.connectOptions, writeConcern};
  // socket related options used to be an object
  // they are now just general options in connectOptions
  if('socketOptions' in options.connectOptions) {
    connectOptions = {
      ...connectOptions,
      ...options.connectOptions.socketOptions
    };
    delete connectOptions.socketOptions;
  }
  const client = await MongoClient.connect(options.url, connectOptions);
  const db = client.db();
  const ping = await db.admin().ping();
  logger.debug(
    'database connection succeeded: db=' + db.databaseName +
    ' username=' + connectOptions?.auth?.user, {ping});
  return {client, db};
}

/**
 * Determines if authn is required.
 *
 * @see
 * https://mongodb.github.io/node-mongodb-native/3.7/api/Admin.html
 * #listDatabases
 * @private
 * @param {object} options - Options to use.
 * @param {object} options.config - The mongodb config.
 * @param {object} options.admin - A Mongo driver Admin class.
 *
 * @returns {Promise<boolean>} Is authRequired?
 */
async function _isAuthnRequired({config, admin}) {
  if(config.forceAuthentication) {
    return true;
  }
  try {
    // if listing databases fails on authz, then authentication is required
    await admin.listDatabases();
  } catch(e) {
    if(e?.code === MDBE_AUTHZ_FAILED) {
      return true;
    }
    // some other error, abort
    throw e;
  }
  return false;
}

function _addAuthOptions({options, config}) {
  options.connectOptions.auth = {
    username: config.username,
    password: config.password
  };
  // authSource is the database to authenticate against
  // this is usually `admin` in dev and a specific db in production
  options.connectOptions.authSource =
    config.connectOptions.authSource || options.database;
  return options;
}

/**
 * Establishes an unauthenticated connection to the server.
 *
 * @private
 * @param {object} options - Options to use.
 * @param {object} options.options - Connection options.
 *
 * @returns {Promise<object>} Returns an object with the db and admin.
 */
async function _getUnauthenticatedDb({options}) {
  // only use the config stuff with out auth credentials
  const opts = {
    ...options.connectOptions,
    ...options.writeOptions,
  };
  // if authSource is defined just delete it here
  delete opts.authSource;
  // remove any parts of the url that could contain authorization data
  const url = urls.sanitize(options.url || '');
  const client = new MongoClient(url, opts);
  await client.connect();
  const db = client.db();
  return {db, admin: db.admin()};
}

function _checkServerVersion({serverInfo, config}) {
  // check that server version is supported
  const {version} = serverInfo;
  logger.info('connected to database', {
    url: urls.sanitize(config.url),
    version,
  });
  // if the server is not at least 3.6.0 throw
  // as mongo node driver 4 only supports 3.6.0 and higher
  if(!semver.gte(version, '3.6.0')) {
    throw new BedrockError(
      'Unsupported database version.',
      'NotSupportedError', {
        url: urls.sanitize(config.url),
        version,
        required: '>= 3.6.0'
      });
  }
  if(config.requirements.serverVersion &&
    !semver.satisfies(version, config.requirements.serverVersion)) {
    throw new BedrockError(
      'Unsupported database version.',
      'NotSupportedError', {
        url: urls.sanitize(config.url),
        version,
        required: config.requirements.serverVersion
      });
  }
}
