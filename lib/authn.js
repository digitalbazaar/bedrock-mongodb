/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from 'bedrock';
import * as urls from './urls.js';
import {logger} from './logger.js';
import {MDBE_AUTHZ_FAILED} from './exceptions.js';
import mongo from 'mongodb';
import semver from 'semver';

const {MongoClient} = mongo;
const {util: {BedrockError}} = bedrock;

export async function openDatabase(options) {
  const config = bedrock.config.mongodb;

  // connect to database and get server info
  const {client, db} = await _connect(options);
  const serverInfo = await db.admin().serverInfo(null);

  // check that server version is supported
  const {version} = serverInfo;
  logger.info('connected to database', {
    url: urls.sanitize(config.url),
    version,
  });
  if(config.requirements.serverVersion) {
    if(!semver.satisfies(version, config.requirements.serverVersion)) {
      throw new BedrockError(
        'Unsupported database version.',
        'DatabaseError', {
          url: urls.sanitize(config.url),
          version,
          required: config.requirements.serverVersion
        });
    }
  }

  // determine if authN is required
  let authRequired;
  if(config.forceAuthentication) {
    authRequired = true;
  } else {
    try {
      // if listing databases fails on authz, then authentication is required
      await db.admin().listDatabases(null);
    } catch(e) {
      if(e && e.code === MDBE_AUTHZ_FAILED) {
        authRequired = true;
      } else {
        // some other error, abort
        throw e;
      }
    }
  }

  if(!authRequired) {
    // return early
    logger.debug('database authentication not required');
    return {client, db};
  }

  // check if server supports roles; if not, can't authenticate
  if(!_usesRoles(serverInfo)) {
    const stringVersion = serverInfo.versionArray.join('.');
    throw new BedrockError(
      `MongoDB server version "${stringVersion}" is unsupported.`,
      'NotSupportedError');
  }

  // try to authenticate...

  // if there is a username & password set, create an auth object for Mongo;
  // otherwise `auth` will be passed as `null` and success will rely on other
  // config options
  let auth = null;
  if(config.username && config.password) {
    auth = {
      user: config.username,
      password: config.password
    };
  }

  // authSource should be set in connectOptions
  const opts = {
    ...config.authentication,
    ...config.connectOptions,
    ...config.writeOptions,
  };

  // if the user specified a connection URL use it
  let url = config.url;
  if(!url) {
    url = urls.create(config);
  }

  // authenticate against shared db
  await loginUser({url, opts, auth});

  logger.debug(
    'database authentication succeeded: db=' + config.name +
    ' username=' + config.username);

  return {client, db};
}

/**
 * Logs in a user using an auth object.
 *
 * @param {object} options - Options to use.
 * @param {object} options.auth - User and password credentials:
 *   options.auth.user - The MongoDB username
 *   options.auth.password - The MongoDB password.
 * @param {object} options.opts - Options for the MongoClient.
 * @param {string} options.url - A mongo connection string.
 *
 * @returns {Promise<MongoClient>} The result of the connect.
*/
export async function loginUser({auth, opts, url}) {
  return MongoClient.connect(url, {auth, ...opts});
}

async function _connect(options) {
  const config = bedrock.config.mongodb;

  if(!options.init) {
    logger.info('connecting to database: ' + urls.sanitize(options.url));
  }
  const {writeConcern} = config.writeOptions;
  let connectOptions = {...config.connectOptions, writeConcern};
  // convert legacy connect options
  if('socketOptions' in config.connectOptions) {
    connectOptions = {
      db: config.options,
      server: config.connectOptions
    };
  }
  if(config.username && config.password) {
    connectOptions.auth = {
      user: config.username,
      password: config.password
    };
    // authSource is the database to authenticate against
    // this is usually `admin` in dev and a specific db in production
    connectOptions.authSource = config.connectOptions.authSource || config.name;
  }

  const client = await MongoClient.connect(options.url, connectOptions);
  const db = client.db();
  return {client, db};
}

function _usesRoles(serverInfo) {
  // >= Mongo 2.6 uses user roles
  return (
    (serverInfo.versionArray[0] == 2 && serverInfo.versionArray[1] >= 6) ||
    (serverInfo.versionArray[0] > 2));
}
