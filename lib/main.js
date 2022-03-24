/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from 'bedrock';
import crypto from 'crypto';
import {logger} from './logger.js';
import mongo from 'mongodb';
import semver from 'semver';
import url from 'url';

const {MongoClient} = mongo;
const {util: {BedrockError, callbackify: brCallbackify}} = bedrock;

// load config defaults
import './config.js';

// exceptions
const MDBE_ERROR = 'MongoError';
const WRITE_ERROR = 'WriteError';
const BULK_WRITE_ERROR = 'BulkWriteError';
const WRITE_CONCERN_ERROR = 'WriteConcernError';
const MDBE_ERRORS = [
  MDBE_ERROR,
  WRITE_ERROR,
  BULK_WRITE_ERROR,
  WRITE_CONCERN_ERROR
];
const MDBE_AUTHN_FAILED = 18;
const MDBE_AUTHZ_FAILED = 13;
const MDBE_DUPLICATE = 11000;
const MDBE_DUPLICATE_ON_UPDATE = 11001;
const MDBE_USER_NOT_FOUND = 11;

// NOTE: this should only be altered by the bedrock-cli.ready event
let testMode = false;

// full database client API
let _client = null;
// database portion of client API
let _db = null;
// shared collections cache
const _collections = {};
export {_client as client, _db as db, _collections as collections};

// Note: exporting `writeOptions` is deprecated
// and will be removed in release 9.0
// default database write options
export const writeOptions = bedrock.config.mongodb.writeOptions;

// load test config
bedrock.events.on('bedrock.test.configure', async () => {
  await import('./test.config.js');
});

bedrock.events.on('bedrock.init', _init);

bedrock.events.on(
  'bedrock.start', () => bedrock.events.emit('bedrock-mongodb.ready'));

bedrock.events.on('bedrock-cli.ready', () => {
  const command = bedrock.config.cli.command;
  if(command.name() === 'test') {
    testMode = true;
  }
});

/**
 * Opens any collections in the given list that aren't already open.
 *
 * @param {Array} names - The names of the collections to open.
 *
 * @returns {Promise} Resolves once the operation completes.
 */
export const openCollections = brCallbackify(async names => {
  // remove collections that are already open
  const unopened = [];
  for(const name of names) {
    if(!(name in _collections)) {
      unopened.push(name);
    }
  }

  // return early if there are no unopened collections
  if(unopened.length === 0) {
    return;
  }

  // create collections as necessary (ignore already exists error)
  await Promise.all(unopened.map(async name => {
    logger.debug('creating collection: ' + name);
    try {
      await _db.createCollection(name);
    } catch(e) {
      if(!isAlreadyExistsError(e)) {
        throw e;
      }
    }
    logger.debug('collection created: ' + name);
  }));

  // open the collections
  logger.debug('opening collections', {collections: unopened});
  const collections = {};
  const {writeConcern} = _db.options;
  await Promise.all(unopened.map(async name => {
    // Note: We only pass `{writeConcern}` here to get around a bug in mongodb
    // node driver 3.6.4 where `writeConcern` from `db` is not passed to
    // collection
    collections[name] = await _db.collection(name, {writeConcern});
  }));

  // merge results into collection cache
  for(const name of unopened) {
    logger.debug('collection open: ' + name);
    _collections[name] = collections[name];
  }
});

/**
 * Creates a hash of a key that can be indexed.
 *
 * @param {string} key - The key to hash.
 *
 * @returns {string} - The hash.
 */
export function hash(key) {
  if(typeof key !== 'string') {
    throw new BedrockError(
      'Invalid key given to database hash method.',
      'InvalidKey', {key});
  }
  const md = crypto.createHash('sha256');
  md.update(key, 'utf8');
  return md.digest('base64');
}

/**
 * Builds an update object using mongodb dot-notation.
 *
 * @param {object} obj - The object with fields to be updated in the database.
 *   [field] optional db encoded parent field
 *   options options for building the update:
 *     [filter] a function used to filter each field encountered to
 *       determine if it should be included in the update or not;
 *       cannot be provided with `include` or `exclude`
 *     [include] dot-delimited fields to include, any not listed will be
 *       excluded; cannot be provided with `filter`
 *     [exclude] dot-delimited db encoded fields to exclude, any listed
 *       will be excluded; cannot be provided with `filter`.
 *
 * @returns {object} The update object to be assigned to $set in an update
 *   query.
 */
export function buildUpdate(obj) {
  let options = null;
  let field = '';
  if(typeof arguments[1] === 'object') {
    options = arguments[1];
  } else {
    if(typeof arguments[1] === 'string') {
      field = arguments[1];
    }
    if(typeof arguments[2] === 'object') {
      options = arguments[2];
    }
  }
  options = options || {};
  const rval = arguments[3] || {};
  if(options.filter) {
    if(typeof options.filter !== 'function') {
      throw new TypeError('options.filter must be a function');
    }
    if(options.include || options.exclude) {
      throw new Error(
        'options.filter must not be provided with options.include ' +
        'or options.exclude');
    }
    if(!options.filter(field, obj)) {
      return rval;
    }
  }
  if('exclude' in options && options.exclude.indexOf(field) !== -1) {
    return rval;
  }
  if('include' in options && field.indexOf('.') !== -1 &&
    options.include.indexOf(field) === -1) {
    return rval;
  }
  if(obj && typeof obj === 'object') {
    if(Array.isArray(obj)) {
      // encode every element in the array
      rval[field] = obj.map(encode);
    } else {
      // for objects, recurse for each field
      Object.keys(obj).forEach(name => {
        const dbName = encodeString(name);
        buildUpdate(obj[name], (field.length > 0) ?
          field + '.' + dbName : dbName, options, rval);
      });
    }
  } else {
    rval[field] = obj;
  }
  return rval;
}

/**
 * Creates indexes.
 *
 * @param {Array} options - An array of objects with:
 *   collection: <collection_name>,
 *   fields: <collection_fields>,
 *   options: <index_options>.
 *
 * @returns {Promise} Resolves once the operation completes.
 */
export const createIndexes = brCallbackify(async options => {
  await Promise.all(options.map(
    async item => _collections[item.collection].createIndex(
      item.fields, item.options)));
});

/**
 * Creates a streaming GridFS bucket instance.
 *
 * By default the writeOptions config value is used for the GridFSBucket
 * writeConcern option.
 *
 * @param {object} options - See GridFSBucket documentation.
 *
 * @returns {object} The new GridFSBucket instance.
 */
export function createGridFSBucket(options) {
  const opts = {...bedrock.config.mongodb.writeOptions, ...options};
  return new mongo.GridFSBucket(_db, opts);
}

/**
 * Encodes a string that contain reserved MongoDB characters.
 *
 * @param {string} value - The value to encode.
 *
 * @returns {string} The encoded result.
 */
export function encodeString(value) {
  // percent-encode '%' and illegal mongodb key characters
  return value
    .replace(/%/g, '%25')
    .replace(/\$/g, '%24')
    .replace(/\./g, '%2E');
}

/**
 * Encodes any keys in the given value that contain reserved MongoDB
 * characters.
 *
 * @param {*} value - The value to encode.
 *
 * @returns {*} The encoded result.
 */
export function encode(value) {
  let rval;
  if(Array.isArray(value)) {
    rval = [];
    value.forEach(e => rval.push(encode(e)));
  } else if(bedrock.util.isObject(value)) {
    rval = {};
    Object.keys(value).forEach(name =>
      rval[encodeString(name)] = encode(value[name]));
  } else {
    rval = value;
  }
  return rval;
}

/**
 * Decodes a string that was previously encoded due to potential of MongoDB
 * characters (or the '%' encode character).
 *
 * @param {string} value - The value to decode.
 *
 * @returns {string} The decoded result.
 */
export function decodeString(value) {
  return decodeURIComponent(value);
}

/**
 * Decodes any keys in the given value that were previously encoded because
 * they contained reserved MongoDB characters (or the '%' encode character).
 *
 * @param {*} value - The value to decode.
 *
 * @returns {*} The decoded result.
 */
export function decode(value) {
  let rval;
  if(Array.isArray(value)) {
    rval = [];
    value.forEach(e => rval.push(decode(e)));
  } else if(bedrock.util.isObject(value)) {
    rval = {};
    Object.keys(value).forEach(name =>
      rval[decodeString(name)] = decode(value[name]));
  } else {
    rval = value;
  }
  return rval;
}

/**
 * Returns true if the given error is a MongoDB 'already exists' error.
 *
 * @param {Error} err - The error to check.
 *
 * @returns {boolean} True if the error is a 'already exists' error, false if
 *   not.
 */
export function isAlreadyExistsError(err) {
  return (err && err.message &&
    err.message.indexOf('already exists') !== -1);
}

/**
 * Returns true if the given error is a MongoDB duplicate key error.
 *
 * @param {Error} err - The error to check.
 *
 * @returns {boolean} True if the error is a duplicate key error, false if not.
 */
export function isDuplicateError(err) {
  return (isDatabaseError(err) &&
    (err.code === MDBE_DUPLICATE || err.code === MDBE_DUPLICATE_ON_UPDATE));
}

/**
 * Returns true if the given error is a MongoDB error.
 *
 * @param {Error} err - The error to check.
 *
 * @returns {boolean} True if the error is a MongoDB related error, false if
 *   not.
 */
export function isDatabaseError(err) {
  return (err && MDBE_ERRORS.includes(err.name));
}

/**
 * A helper method for incrementing cycling update IDs.
 *
 * @param {number} updateId - The current update ID.
 *
 * @returns {number} The new update ID.
 */
export function getNextUpdateId(updateId) {
  return (updateId < 0xffffffff) ? (updateId + 1) : 0;
}

async function _init() {
  const config = bedrock.config.mongodb;

  if(!config.url) {
    config.url = _createUrl(config);
  }

  try {
    // initialize the database just once via a single worker
    await bedrock.runOnce('bedrock-mongodb.init', _initDatabase);

    // open database
    logger.info('opening database', {url: _sanitizeUrl(config.url)});
    const {client, db} = await _openDatabase({url: config.url, init: false});

    _client = client;
    _db = db;

    // drop any collections as requested
    if(testMode && config.dropCollections.onInit) {
      await _dropCollections();
    }
  } catch(e) {
    logger.error('could not initialize database', e);
    throw new BedrockError(
      'Could not initialize database.',
      'DatabaseError', {
        url: _sanitizeUrl(config.url)
      }, e);
  }
}

async function _initDatabase() {
  const config = bedrock.config.mongodb;

  // connect to dbs
  let client;

  logger.info('initializing database', {url: _sanitizeUrl(config.url)});

  try {
    let needsPrompt = false;
    try {
      ({client} = await _openDatabase({url: config.url, init: true}));
    } catch(e) {
      if(isDatabaseError(e) && (e.code === MDBE_AUTHN_FAILED ||
        e.message === 'could not authenticate')) {
        // auth failed, either DB didn't exist or bad credentials
        logger.info('database authentication failed:' +
          ' db=' + config.name +
          ' username=' + config.username);
        if(config.adminPrompt) {
          needsPrompt = true;
        }
      }
      if(!needsPrompt) {
        throw new BedrockError(
          'Could not initialize database.',
          'DatabaseError', {
            url: _sanitizeUrl(config.url)
          }, e);
      }
    }

    if(needsPrompt) {
      // prompt to try creating database user
      await _promptToCreateUser();
    }
  } finally {
    // force client to close connections (do not reuse connections used to init
    // database as other connections will be used later that may have different
    // credentials)
    if(client) {
      const force = true;
      await client.close(force).catch(error => {
        logger.error(
          'failed to close client used to initialize database', {error});
      });
    }
  }
}

async function _openDatabase(options) {
  const config = bedrock.config.mongodb;

  // connect to database and get server info
  const {client, db} = await _connect(options);
  const serverInfo = await db.admin().serverInfo(null);

  // check that server version is supported
  const {version} = serverInfo;
  logger.info('connected to database', {
    url: _sanitizeUrl(config.url),
    version,
  });
  if(config.requirements.serverVersion) {
    if(!semver.satisfies(version, config.requirements.serverVersion)) {
      throw new BedrockError(
        'Unsupported database version.',
        'DatabaseError', {
          url: _sanitizeUrl(config.url),
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
    url = _createUrl(config);
  }

  // authenticate against shared db
  await _loginUser({url, opts, auth});

  logger.debug(
    'database authentication succeeded: db=' + config.name +
    ' username=' + config.username);

  return {client, db};
}

async function _connect(options) {
  const config = bedrock.config.mongodb;

  if(!options.init) {
    logger.info('connecting to database: ' + _sanitizeUrl(options.url));
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
async function _loginUser({auth, opts, url}) {
  return MongoClient.connect(url, {auth, ...opts});
}

async function _promptToCreateUser() {
  const config = bedrock.config.mongodb;
  console.log('\nA new, upgrade, or incomplete database setup scenario ' +
    'has been detected. To ensure the database "' + config.name +
    '" exists and its primary user "' + config.username + '" ' +
    'exists and has sufficient access privileges, please enter the ' +
    'following information.');

  // prompt for admin credentials
  const auth = await _getAdminCredentials();

  // authenticate w/server as admin
  const opts = {
    ...config.authentication,
    ...config.connectOptions,
    authSource: auth.authSource
  };
  // in case you forget to enter an authSource in the config it is added here
  if(!config.connectOptions.authSource) {
    config.connectOptions.authSource = auth.authSource;
  }
  const adminConfig = {...config, ...auth};
  const url = _createUrl(adminConfig);

  // this returns the client logged in as the admin
  const client = await _loginUser({auth, opts, url});

  // try to get server info to confirm proper authN as admin
  const db = client.db(auth.authSource);
  await db.admin().serverInfo(null);

  // ensure the configured user has the appropriate roles
  // TODO: refactor to avoid removing user; driver doesn't seem to provide
  // high-level calls for granting roles, etc. so here we just remove the
  // whole user and replace it entirely
  try {
    await db.removeUser(config.username);
  } catch(e) {
    // ignore user not found, throw all other errors
    if(!(isDatabaseError(e) && e.code === MDBE_USER_NOT_FOUND)) {
      throw e;
    }
  }

  // add configured user
  await db.addUser(config.username, config.password, _getAddUserOptions());
}

async function _getAdminCredentials() {
  return (await import('prompt'))
    .start()
    .get({
      properties: {
        username: {
          description: 'Enter the MongoDB administrator username',
          pattern: /^.{4,}$/,
          message: 'The username must be at least 4 characters.',
          default: 'admin'
        },
        password: {
          description: 'Enter the MongoDB administrator password',
          pattern: /^.{8,}$/,
          message: 'The password must be at least 8 characters.',
          hidden: true,
          default: 'password'
        },
        authSource: {
          description: 'Enter the MongoDB administrator database',
          pattern: /^.{4,}$/,
          message: 'The authSource must be at least 4 characters.',
          default: 'admin'
        }
      }
    });
}

function _getAddUserOptions() {
  const config = bedrock.config.mongodb;
  return bedrock.util.extend({}, config.writeOptions, {
    roles: [
      'dbOwner',
      {role: 'dbAdmin', db: config.name, collection: config.collection},
      {role: 'readWrite', db: config.name, collection: config.collection}
    ]
  });
}

function _usesRoles(serverInfo) {
  // >= Mongo 2.6 uses user roles
  return (
    (serverInfo.versionArray[0] == 2 && serverInfo.versionArray[1] >= 6) ||
    (serverInfo.versionArray[0] > 2));
}

async function _dropCollections() {
  if(bedrock.config.mongodb.dropCollections.collections === undefined) {
    throw new BedrockError(
      'If bedrock.config.mongodb.dropCollection.onInit is specified, ' +
      'bedrock.config.mongodb.dropCollection.collections must also ' +
      'be specified.', 'InvalidConfiguration');
  }
  // if collectionsToDrop array is empty, all collections should be dropped
  const cArray = bedrock.config.mongodb.dropCollections.collections;
  const collections = await _db.collections();
  await Promise.all(collections
    .filter(collection =>
      // never drop `system.indexes` and only drop if `cArray` is
      // empty (meaning drop all collections) or if the name is a match
      collection.collectionName !== 'system.indexes' &&
        (cArray.length === 0 || cArray.includes(collection.collectionName)))
    .map(async collection => {
      logger.debug(`dropping collection: ${collection.namespace}`);
      try {
        await collection.drop();
      } catch(e) {
        // only ignore collection not found error, throw any others
        if(e.message !== 'ns not found') {
          throw e;
        }
      }
    }));
}

function _createUrl(config) {
  let url = 'mongodb://';
  if(config.username) {
    url += `${config.username}:${config.password}@`;
  }
  url += `${config.host}:${config.port}/${config.name}`;
  // this needs to come last
  if(config.username) {
    url += `?authSource=${config.connectOptions.authSource || 'admin'}`;
  }
  return url;
}

function _sanitizeUrl(path) {
  const urlParts = url.parse(path);
  return `${urlParts.protocol}//${urlParts.host}${urlParts.path}`;
}
