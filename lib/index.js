/*
 * Bedrock mongodb module.
 *
 * This modules exposes an API for accessing MongoDB databases.
 * This API is mostly used to communicate with the shared database -- this
 * database can be sharded and replicated across multiple machines. Any shared
 * collections are exposed via this module's 'collections' property.
 *
 * Copyright (c) 2012-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const crypto = require('crypto');
const logger = require('./logger');
const mongo = require('mongodb');
const semver = require('semver');
const {callbackify, promisify} = require('util');
const brCallbackify = bedrock.util.callbackify;
const url = require('url');

const {BedrockError} = bedrock.util;
const {MongoClient} = mongo;

// load config defaults
require('./config');

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
const MDBE_AUTH_FAILED = 18;
const MDBE_DUPLICATE = 11000;
const MDBE_DUPLICATE_ON_UPDATE = 11001;
const MDBE_USER_NOT_FOUND = 11;

// module API
const api = {};
module.exports = api;

// NOTE: this should only be altered by the bedrock-cli.ready event
let testMode = false;

// database client(s)
api.client = null;

// database itself
api.db = null;

// shared collections cache
api.collections = {};

const {writeConcern} = bedrock.config.mongodb;

// default database write options
api.writeOptions = {...bedrock.config.mongodb.writeOptions, writeConcern};

// load test config
bedrock.events.on('bedrock.test.configure', () => require('./test.config'));

bedrock.events.on('bedrock.init', promisify(init));

bedrock.events.on(
  'bedrock.start', () => bedrock.events.emit('bedrock-mongodb.ready'));

bedrock.events.on('bedrock-cli.ready', () => {
  const command = bedrock.config.cli.command;
  if(command.name() === 'test') {
    testMode = true;
  }
});

function init(callback) {
  const config = bedrock.config.mongodb;

  if(!config.url) {
    config.url = _createUrl(config);
  }

  async.auto({
    initDatabase: callback => callbackify(bedrock.runOnce)(
      'bedrock-mongodb.init', promisify(_initDatabase), {}, callback),
    open: ['initDatabase', (results, callback) => {
      logger.info('opening database', {url: _sanitizeUrl(config.url)});
      _openDatabase({
        url: config.url,
        init: false
      }, callback);
    }],
    dropCollections: ['open', (results, callback) => {
      api.client = results.open.client;
      api.db = results.open.db;
      if(testMode && config.dropCollections.onInit) {
        return _dropCollections(callback);
      }
      callback(null);
    }],
    openCollections: ['dropCollections', (results, callback) =>
      api.openCollections(['distributedId'], callback)],
    createIndexes: ['openCollections', (results, callback) =>
      api.createIndexes([{
        collection: 'distributedId',
        fields: {namespace: 1},
        options: {unique: true, background: true}
      }], callback)],
  }, err => {
    if(err) {
      logger.error('could not initialize database', err);
      return callback(new BedrockError(
        'Could not initialize database.',
        'DatabaseError', {
          url: _sanitizeUrl(config.url)
        }, err));
    }
    callback(err);
  });
}

/**
 * Opens any collections in the given list that aren't already open.
 *
 * @param names the names of the collections to open.
 * @param callback(err) called once the operation completes.
 */
api.openCollections = brCallbackify(async names => {
  // remove collections that are already open
  const unopened = [];
  for(const name of names) {
    if(!(name in api.collections)) {
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
      await api.db.createCollection(name, {writeConcern});
    } catch(e) {
      if(!api.isAlreadyExistsError(e)) {
        throw e;
      }
    }
    logger.debug('collection created: ' + name);
  }));

  // open the collections
  logger.debug('opening collections', {collections: unopened});
  const collections = {};
  await Promise.all(unopened.map(async name => {
    collections[name] = await api.db.collection(name, {writeConcern});
  }));

  // merge results into collection cache
  for(const name of unopened) {
    logger.debug('collection open: ' + name);
    api.collections[name] = collections[name];
  }
});

/**
 * Creates a hash of a key that can be indexed.
 *
 * @param key the key to hash.
 *
 * @return the hash.
 */
api.hash = key => {
  if(typeof key !== 'string') {
    throw new BedrockError(
      'Invalid key given to database hash method.',
      'InvalidKey', {key});
  }
  const md = crypto.createHash('sha256');
  md.update(key, 'utf8');
  return md.digest('base64');
};

/**
 * Builds an update object using mongodb dot-notation.
 *
 * @param obj the object with fields to be updated in the database.
 * @param [field] optional db encoded parent field.
 * @param options options for building the update:
 *          [filter] a function used to filter each field encountered to
 *            determine if it should be included in the update or not;
 *            cannot be provided with `include` or `exclude`.
 *          [include] dot-delimited fields to include, any not listed will be
 *            excluded; cannot be provided with `filter`.
 *          [exclude] dot-delimited db encoded fields to exclude, any listed
 *            will be excluded; cannot be provided with `filter`.
 *
 * @return the update object to be assigned to $set in an update query.
 */
api.buildUpdate = function(obj) {
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
      rval[field] = obj.map(api.encode);
    } else {
      // for objects, recurse for each field
      Object.keys(obj).forEach(name => {
        const dbName = api.encodeString(name);
        api.buildUpdate(obj[name], (field.length > 0) ?
          field + '.' + dbName : dbName, options, rval);
      });
    }
  } else {
    rval[field] = obj;
  }
  return rval;
};

/**
 * Creates indexes.
 *
 * @param options an array of:
 *          collection: <collection_name>,
 *          fields: <collection_fields>,
 *          options: <index_options>
 * @param callback(err) called once the operation completes.
 */
api.createIndexes = brCallbackify(async options => {
  await Promise.all(options.map(
    async item => api.collections[item.collection].createIndex(
      item.fields, item.options)));
});

/**
 * Creates a streaming GridFS bucket instance.
 *
 * By default the writeOptions config value is used for the GridFSBucket
 * writeConcern option.
 *
 * @param options see GridFSBucket documentation
 *
 * @return the new GridFSBucket instance
 */
api.createGridFSBucket = options => {
  const opts = Object.assign({}, {...api.writeOptions}, options);
  return new mongo.GridFSBucket(api.db, opts);
};

/**
 * Encodes a string that contain reserved MongoDB characters.
 *
 * @param value the value to encode.
 *
 * @return the encoded result.
 */
api.encodeString = value => {
  // percent-encode '%' and illegal mongodb key characters
  return value
    .replace(/%/g, '%25')
    .replace(/\$/g, '%24')
    .replace(/\./g, '%2E');
};

/**
 * Encodes any keys in the given value that contain reserved MongoDB
 * characters.
 *
 * @param value the value to encode.
 *
 * @return the encoded result.
 */
api.encode = value => {
  let rval;
  if(Array.isArray(value)) {
    rval = [];
    value.forEach(e => rval.push(api.encode(e)));
  } else if(bedrock.util.isObject(value)) {
    rval = {};
    Object.keys(value).forEach(name =>
      rval[api.encodeString(name)] = api.encode(value[name]));
  } else {
    rval = value;
  }
  return rval;
};

/**
 * Decodes a string that was previously encoded due to potential of MongoDB
 * characters (or the '%' encode character).
 *
 * @param value the value to decode.
 *
 * @return the decoded result.
 */
api.decodeString = value => decodeURIComponent(value);

/**
 * Decodes any keys in the given value that were previously encoded because
 * they contained reserved MongoDB characters (or the '%' encode character).
 *
 * @param value the value to decode.
 *
 * @return the decoded result.
 */
api.decode = value => {
  let rval;
  if(Array.isArray(value)) {
    rval = [];
    value.forEach(e => rval.push(api.decode(e)));
  } else if(bedrock.util.isObject(value)) {
    rval = {};
    Object.keys(value).forEach(name =>
      rval[api.decodeString(name)] = api.decode(value[name]));
  } else {
    rval = value;
  }
  return rval;
};

/**
 * Returns true if the given error is a MongoDB 'already exists' error.
 *
 * @param err the error to check.
 *
 * @return true if the error is a 'already exists' error, false if not.
 */
api.isAlreadyExistsError = err => (err && err.message &&
  err.message.indexOf('already exists') !== -1);

/**
 * Returns true if the given error is a MongoDB duplicate key error.
 *
 * @param err the error to check.
 *
 * @return true if the error is a duplicate key error, false if not.
 */
api.isDuplicateError = err => (api.isDatabaseError(err) &&
  (err.code === MDBE_DUPLICATE || err.code === MDBE_DUPLICATE_ON_UPDATE));

/**
 * Returns true if the given error is a MongoDB error.
 *
 * @param err the error to check.
 *
 * @return true if the error is a MongoDB related error, false if not.
 */
api.isDatabaseError = err => (err && MDBE_ERRORS.includes(err.name));

/**
 * A helper method for incrementing cycling update IDs.
 *
 * @param updateId the current update ID.
 *
 * @return the new update ID.
 */
api.getNextUpdateId = updateId => (updateId < 0xffffffff) ? (updateId + 1) : 0;

function _initDatabase(callback) {
  const config = bedrock.config.mongodb;

  // connect to dbs
  let client;
  async.auto({
    open: callback => {
      // TODO: merge similar callbacks below into single function
      logger.info('initializing database', {url: _sanitizeUrl(config.url)});
      _openDatabase({
        url: config.url,
        init: true
      }, (err, {client: _client}) => {
        client = _client;
        if(!err) {
          return callback(null, true);
        }
        if(api.isDatabaseError(err) && (err.code === MDBE_AUTH_FAILED ||
          err.message === 'could not authenticate')) {
          // auth failed, either DB didn't exist or bad credentials
          logger.info('database authentication failed:' +
            ' db=' + config.name +
            ' username=' + config.username);
          if(config.adminPrompt) {
            return callback(null, false);
          }
        }
        return callback(new BedrockError(
          'Could not initialize database.',
          'DatabaseError', {
            url: _sanitizeUrl(config.url)
          }, err));
      });
    },
    check: ['open', (results, callback) => {
      // open and authenticated, finish
      if(results.open) {
        return callback();
      }
      // try to create user
      _createUser(callback);
    }]
  }, err => {
    // force clients to close (do not reuse connections)
    async.auto({
      close: callback => {
        if(!client) {
          return callback();
        }
        client.close(true, () => callback());
      }
    }, () => callback(err));
  });
}

function _openDatabase(options, callback) {
  const config = bedrock.config.mongodb;
  let db;
  let client;
  async.auto({
    connect: callback => _connect(options, callback),
    serverInfo: ['connect', (results, callback) => {
      db = results.connect.db;
      client = results.connect.client;
      db.admin().serverInfo(null, callback);
    }],
    serverCheck: ['serverInfo', (results, callback) => {
      const version = results.serverInfo.version;
      logger.info('connected to database', {
        url: _sanitizeUrl(config.url),
        version,
      });
      if(config.requirements.serverVersion) {
        if(!semver.satisfies(version, config.requirements.serverVersion)) {
          return callback(new BedrockError(
            'Unsupported database version.',
            'DatabaseError', {
              url: _sanitizeUrl(config.url),
              version,
              required: config.requirements.serverVersion
            }));
        }
      }
      callback(null, true);
    }],
    checkAuthRequired: ['connect', 'serverCheck', (results, callback) => {
      if(config.forceAuthentication) {
        return callback(null, true);
      }
      const db = results.connect.db;
      let authRequired = false;
      db.admin().listDatabases(null, err => {
        // if an authorization error is returned, authorization is required
        if(err && err.code === 13) {
          authRequired = true;
          return callback(null, authRequired);
        }
        callback(err, authRequired);
      });
    }],
    auth: ['serverInfo', 'checkAuthRequired', (results, callback) => {
      if(!results.checkAuthRequired) {
        return callback(null, 'NotRequired');
      }
      let auth = null;
      // if there is a username & password set create an auth object for Mongo
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
        writeConcern
      };
      let url = config.url;
      // if the user specified a connection URL use it
      if(!url) {
        url = _createUrl(config);
      }
      if(_usesRoles(results.serverInfo)) {
        // authenticate against shared db
        return _loginUser({url, opts, auth, callback});
      }
      const version = results.serverInfo.versionArray.join('.');
      throw new BedrockError(
        `MongoDB server version ${version} is unsupported.`,
        'NotSupportedError');
    }],
    authSuccess: ['auth', (results, callback) => {
      if(results.auth === 'NotRequired') {
        logger.debug('database authentication not required');
        return callback();
      }
      logger.debug('database authentication succeeded: db=' + config.name +
        ' username=' + config.username);
      callback();
    }]
  }, err => callback(err, {db, client}));
}

function _connect(options, callback) {
  const config = bedrock.config.mongodb;

  if(!options.init) {
    logger.info('connecting to database: ' + _sanitizeUrl(options.url));
  }

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

  MongoClient.connect(options.url, connectOptions, (err, client) => {
    if(err) {
      return callback(err);
    }

    const db = client.db();

    callback(null, {db, client});
  });
}

/**
 * Logs in a user using an auth object.
 *
 * @param {object} options - Options to use.
 * @param {object} options.auth - user and password credentials.
 * @param {string} options.auth.user - The MongoDB username.
 * @param {string} options.auth.password - The MongoDB password.
 * @param {object} options.opts - Options for the MongoClient.
 * @param {Server} options.url - A mongo connection string.
 * @param {Function} options.callback - A callback function.
 *
 * @returns The result of the connect in the callback.
*/
function _loginUser({auth, opts, url, callback}) {
  return MongoClient.connect(url, {auth, ...opts}, callback);
}

function _createUser(callback) {
  const config = bedrock.config.mongodb;
  const opts = {...config.authentication, ...config.connectOptions};
  const admin = {
    db: null,
    client: null,
    auth: null,
    url: null
  };
  console.log('\nA new, upgrade, or incomplete database setup scenario ' +
    'has been detected. To ensure the database "' + config.name +
    '" exists and its primary user "' + config.username + '" ' +
    'exists and has sufficient access privileges, please enter the ' +
    'following information.');

  async.auto({
    admin: _getAdminCredentials,
    // authenticate w/server as admin
    auth: ['admin', (results, callback) => {
      admin.auth = {
        user: results.admin.username,
        password: results.admin.password,
        authSource: results.admin.authSource || 'admin'
      };
      opts.authSource = admin.auth.authSource;
      // in case you forget to enter an authSource in the config.
      if(!config.connectOptions.authSource) {
        config.connectOptions.authSource = admin.auth.authSource;
      }
      const adminConfig = {...config, ...results.admin};
      admin.url = _createUrl(adminConfig);
      _loginUser({auth: admin.auth, opts, url: admin.url, callback});
    }],
    serverInfo: ['auth', (results, callback) => {
      admin.client = results.auth;
      admin.db = admin.client.db(admin.auth.authSource);
      admin.db.admin().serverInfo(null, callback);
    }],
    // TODO: refactor to avoid removing user; driver doesn't seem to provide
    // high-level calls for granting roles, etc.
    removeUser: ['auth', (results, callback) => admin.db.removeUser(
      config.username, err => {
        // ignore user not found
        if(api.isDatabaseError(err) && err.code === MDBE_USER_NOT_FOUND) {
          err = null;
        }
        callback(err);
      })],
    addUser: ['removeUser', (results, callback) => admin.db.addUser(
      config.username, config.password, _getAddUserOptions(),
      callback)]
  }, callback);
}

function _getAdminCredentials(callback) {
  require('prompt')
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
    }, callback);
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

function _dropCollections(callback) {
  if(bedrock.config.mongodb.dropCollections.collections === undefined) {
    return callback(
      new BedrockError(
        'If bedrock.config.mongodb.dropCollection.onInit is specified, ' +
        'bedrock.config.mongodb.dropCollection.collections must also ' +
        'be specified.', 'InvalidConfiguration'));
  }
  // if collectionsToDrop array is empty, all collections should be dropped
  const cArray = bedrock.config.mongodb.dropCollections.collections;
  api.db.collections((skip, collections) => {
    async.each(collections, (collection, callback) => {
      if(collection.collectionName === 'system.indexes') {
        return callback();
      }
      if(cArray.length > 0 && cArray.indexOf(collection.collectionName) == -1) {
        return callback();
      }
      logger.debug(`dropping collection: ${collection.namespace}`);
      collection.drop(err => {
        if(err && err.message === 'ns not found') {
          // ignore collection not found error
          return callback();
        }
        callback(err);
      });
    }, callback);
  });
}

function _createUrl(config) {
  let url = 'mongodb://';
  if(config.username) {
    url += `${config.username}:${config.password}@`;
  }
  url += `${config.host}:${config.port}/${config.name}`;
  // this needs to come last
  if(config.username) {
    url +=
      `?authSource=${config.connectOptions.authSource || 'admin'}`;
  }
  return url;
}

function _sanitizeUrl(path) {
  const urlParts = url.parse(path);
  return `${urlParts.protocol}//${urlParts.host}${urlParts.path}`;
}
