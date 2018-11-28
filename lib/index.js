/*
 * Bedrock mongodb module.
 *
 * This modules exposes an API for accessing the shared and local databases.
 * This API is mostly used to communicate with the shared database -- this
 * database can be sharded and replicated across multiple machines. Any shared
 * collections are exposed via this module's 'collections' property.
 *
 * The API also exposes a single document in a local database. This database
 * is not sharded or replicated to other machines. It has a single collection
 * with a single document that can be updated atomically. The expectation is
 * that very little data needs to be stored locally (eg: local parts of
 * distributed IDs, etc.). This module exposes the local collection via
 * the 'localCollection' property. The single local document in that
 * collection has two properties: 'id' and 'local'. The value of 'id'
 * is exposed by this module as 'localDocumentId'. The value of 'local' is
 * a JSON object where local properties should be stored.
 *
 * Copyright (c) 2012-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const chloride = require('chloride');
const crypto = require('crypto');
const logger = require('./logger');
const mongo = require('mongodb');
const mongodbUri = require('mongodb-uri');
const semver = require('semver');
const {BedrockError} = bedrock.util;

// load config defaults
require('./config');

// exceptions
const MDBE_ERROR = 'MongoError';
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
api.localClient = null;

// shared collections cache
api.collections = {};

// local collection
api.localCollection = null;
// local document ID
api.localDocumentId = 'local';

// migration API
api._migration = require('./migration');

// default database write options
api.writeOptions = bedrock.config.mongodb.writeOptions;
api.localWriteOptions = bedrock.config.mongodb.local.writeOptions;

// distributed ID generator class
let DistributedIdGenerator;

// id generators
const idGenerators = {};

// load test config
bedrock.events.on('bedrock.test.configure', () => require('./test.config'));

bedrock.events.on('bedrock.init', init);

bedrock.events.on('bedrock.start', callback => bedrock.events.emit(
  'bedrock-mongodb.ready', callback));

bedrock.events.on('bedrock-cli.ready', callback => {
  const command = bedrock.config.cli.command;
  if(command.name() === 'test') {
    testMode = true;
  }
  callback();
});

function init(callback) {
  const config = bedrock.config.mongodb;

  if(config.url) {
    // update broken-down config values from URL
    const parsed = mongodbUri.parse(config.url);
    if('database' in parsed) {
      config.name = parsed.database;
    } else {
      // ensure database is set
      parsed.database = config.name;
    }
    if(parsed.hosts.length > 0) {
      config.host = parsed.hosts[0].host;
      if('port' in parsed.hosts[0]) {
        config.port = parsed.hosts[0].port;
      } else {
        // default mongodb port
        config.port = 27017;
      }
    }
    if('username' in parsed) {
      config.username = parsed.username;
      delete parsed.username;
    }
    if('password' in parsed) {
      config.password = parsed.password;
      delete parsed.password;
    }
    // rewrite URL w/o auth credentials
    config.url = mongodbUri.format(parsed);
  } else {
    // build URL
    config.url =
      'mongodb://' + config.host + ':' + config.port + '/' + config.name;
  }

  if(!config.local.url) {
    // build local URL
    config.local.url =
      'mongodb://' + config.host + ':' + config.port + '/' + config.local.name;
  }

  async.auto({
    initDatabase: callback => bedrock.runOnce(
      'bedrock-mongodb.init', _initDatabase, callback),
    open: ['initDatabase', (results, callback) => {
      logger.info('opening database', {url: config.url});
      _openDatabase({
        url: config.url,
        init: false
      }, callback);
    }],
    openLocal: ['initDatabase', (results, callback) => {
      if(!config.local.enable) {
        logger.debug('opening local database disabled');
        return callback(null, null);
      }
      logger.info('opening local database', {url: config.local.url});
      _openDatabase({
        url: config.local.url,
        init: false
      }, callback);
    }],
    dropCollections: ['open', (results, callback) => {
      api.client = results.open;
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
    setupLocal: ['openLocal', (results, callback) => {
      // setup machine-local (non-replicated) database
      api.localClient = results.openLocal;
      if(!results.openLocal) {
        return callback();
      }
      _setupLocalDatabase(callback);
    }]
  }, err => {
    if(err) {
      logger.error('could not initialize database', err);
      return callback(new BedrockError(
        'Could not initialize database.',
        'DatabaseError', {
          url: config.url
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
api.openCollections = (names, callback) => {
  // remove collections that are already open
  const unopened = [];
  names.forEach(name => {
    if(!(name in api.collections)) {
      unopened.push(name);
    }
  });

  // create collections as necessary (ignore already exists error)
  async.each(unopened, (name, callback) => {
    logger.debug('creating collection: ' + name);
    api.client.createCollection(name, function ignoreAlreadyExists(err) {
      if(err) {
        if(api.isAlreadyExistsError(err)) {
          err = null;
        }
        return callback(err);
      }
      logger.debug('collection created: ' + name);
      callback();
    });
  // now open the collections
  }, function openCollections(err) {
    if(err || unopened.length === 0) {
      return callback(err);
    }
    // build async request
    const collections = {};
    names.forEach(function(name) {
      if(!(name in api.collections)) {
        collections[name] = function(callback) {
          api.client.collection(name, callback);
        };
      }
    });

    // open collections
    logger.debug('opening collections', {collections: names});
    async.parallel(collections, (err, results) => {
      if(err) {
        return callback(err);
      }
      // merge results into collection cache
      for(const name in results) {
        if(!(name in api.collections)) {
          logger.debug('collection open: ' + name);
          api.collections[name] = results[name];
        }
      }
      callback();
    });
  });
};

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
  // FIXME: consider returning buffer
  return chloride.crypto_generichash(
    new Buffer(key, 'utf8'), 32).toString('base64');
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
api.createIndexes = (options, callback) => async.each(
  options, (item, callback) => api.collections[item.collection].createIndex(
    item.fields, item.options, callback), callback);

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
  const opts = Object.assign({}, {writeConcern: api.writeOptions}, options);
  return new mongo.GridFSBucket(api.client, opts);
};

/**
 * Gets the DistributedIdGenerator for the given namespace. If the
 * DistributedIdGenerator object does not exist, it will be created.
 *
 * @param namespace the ID namespace.
 * @param callback(err, idGenerator) called once the operation completes.
 */
api.getDistributedIdGenerator = (namespace, callback) => {
  if(namespace in idGenerators) {
    return callback(null, idGenerators[namespace]);
  }

  // lazy load
  if(!DistributedIdGenerator) {
    DistributedIdGenerator = require('./idGenerator').DistributedIdGenerator;
  }

  // create and initialize ID generator
  const idGenerator = new DistributedIdGenerator();
  async.waterfall([
    callback => idGenerator.init(namespace, callback),
    callback => {
      idGenerators[namespace] = idGenerator;
      callback(null, idGenerator);
    }
  ], callback);
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
 * Connects to and prepares the machine-local (non-replicated) database.
 *
 * @param callback(err) called once the operation completes.
 */
function _setupLocalDatabase(callback) {
  // local collection name
  const name = bedrock.config.mongodb.local.collection;

  async.waterfall([
    // create local collection
    callback => api.localClient.createCollection(
      name, function ignoreAlreadyExists(err) {
        if(err) {
          if(api.isAlreadyExistsError(err)) {
            err = null;
          }
          return callback(err);
        }
        logger.debug('local collection created: ' + name);
        callback();
      }),
    // open local collection
    callback => api.localClient.collection(name, callback),
    (collection, callback) => {
      // cache local collection
      api.localCollection = collection;

      // create index
      api.localCollection.createIndex(
        {id: true}, {unique: true, background: true}, err => callback(err));
    },
    callback => {
      // insert local document
      const record = {id: api.localDocumentId, local: {}};
      api.localCollection.insert(record, api.localWriteOptions, err => {
        // ignore duplicate errors
        if(err && api.isDuplicateError(err)) {
          err = null;
        }
        callback(err);
      });
    }
  ], callback);
}

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
 * @return true if the error is a duplicate key error, false if not.
 */
api.isDatabaseError = err => (err && err.name === MDBE_ERROR);

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

  // connect to shared and local dbs
  let client;
  let localClient;
  async.auto({
    open: callback => {
      // TODO: merge similar callbacks below into single function
      logger.info('initializing database', {url: config.url});
      _openDatabase({
        url: config.url,
        init: true
      }, (err, db) => {
        client = db;
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
            url: config.url
          }, err));
      });
    },
    openLocal: callback => {
      if(!config.local.enable) {
        logger.debug('initializing local database disabled');
        return callback(null, null);
      }
      logger.info('initializing local database', {url: config.local.url});
      _openDatabase({url: config.local.url, init: true}, (err, db) => {
        localClient = db;
        if(!err) {
          return callback(null, true);
        }
        if(api.isDatabaseError(err) && (err.code === MDBE_AUTH_FAILED ||
          err.message === 'could not authenticate')) {
          // auth failed, either DB didn't exist or bad credentials
          logger.info('local database authentication failed:' +
            ' db=' + config.local.name +
            ' username=' + config.username);
          if(config.adminPrompt) {
            return callback(null, false);
          }
        }
        return callback(new BedrockError(
          'Could not initialize local database.',
          'DatabaseError', {
            url: config.local.url
          }, err));
      });
    },
    check: ['open', 'openLocal', (results, callback) => {
      // open and authenticated, finish
      if(results.open && (results.openLocal || !config.local.enable)) {
        return callback();
      }
      // try to create user
      _createUser(client, localClient, callback);
    }]
  }, err => {
    // force clients to close (do not reuse connections)
    async.auto({
      close: callback => {
        if(!client) {
          return callback();
        }
        client.close(true, () => callback());
      },
      closeLocal: callback => {
        if(!localClient) {
          return callback();
        }
        localClient.close(true, () => callback());
      }
    }, () => callback(err));
  });
}

function _openDatabase(options, callback) {
  const config = bedrock.config.mongodb;
  let db;
  async.auto({
    connect: callback => _connect(options, callback),
    serverInfo: ['connect', (results, callback) => {
      db = results.connect;
      db.admin().serverInfo(callback);
    }],
    serverCheck: ['serverInfo', (results, callback) => {
      const version = results.serverInfo.version;
      logger.info('connected to database', {
        url: config.url,
        version,
      });
      if(config.requirements.serverVersion) {
        if(!semver.satisfies(version, config.requirements.serverVersion)) {
          return callback(new BedrockError(
            'Unsupported database version.',
            'DatabaseError', {
              url: config.url,
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
      const db = results.connect;
      let authRequired = false;
      db.admin().listDatabases(err => {
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
      const username = config.username;
      const password = config.password;
      let opts = config.authentication;
      if(_usesRoles(results.serverInfo)) {
        // authenticate against shared db
        opts = bedrock.util.extend({}, opts, {authdb: config.name});
        return db.authenticate(username, password, opts, callback);
      }
      // backwards-compatible mode; auth using opened db
      opts = bedrock.util.extend({}, opts, {authdb: db.databaseName});
      db.authenticate(username, password, opts, callback);
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
  }, err => callback(err, db));
}

function _connect(options, callback) {
  const config = bedrock.config.mongodb;

  if(!options.init) {
    logger.info('connecting to database: ' + options.url);
  }

  let connectOptions = config.connectOptions;
  // convert legacy connect options
  if('socketOptions' in config.connectOptions) {
    connectOptions = {
      db: config.options,
      server: config.connectOptions
    };
  }

  mongo.MongoClient.connect(options.url, connectOptions, (err, db) => {
    if(!err && !options.init) {
      logger.info('connecting to database: ' + options.url);
    }
    callback(err, db);
  });
}

function _createUser(client, localClient, callback) {
  const config = bedrock.config;

  console.log('\nA new, upgrade, or incomplete database setup scenario ' +
    'has been detected. To ensure the database "' + config.mongodb.name +
    '" exists and its primary user "' + config.mongodb.username + '" ' +
    'exists and has sufficient access privileges, please enter the ' +
    'following information.');

  async.auto({
    admin: _getAdminCredentials,
    // authenticate w/server as admin
    auth: ['admin', (results, callback) => client.authenticate(
      results.admin.username, results.admin.password, {authdb: 'admin'},
      callback)],
    serverInfo: ['auth', (results, callback) =>
      client.admin().serverInfo(callback)],
    addLocalUser: ['serverInfo', (results, callback) => {
      if(!config.mongodb.local.enable) {
        return callback();
      }
      // skip if user roles are used as they will provide access to local db
      if(_usesRoles(results.serverInfo)) {
        return callback();
      }
      async.auto({
        // authenticate w/server as admin
        auth: callback => localClient.authenticate(
          results.admin.username, results.admin.password, {authdb: 'admin'},
          callback),
        removeUser: ['auth', (results, callback) => localClient.removeUser(
          config.mongodb.username, err => {
            // ignore user not found
            if(api.isDatabaseError(err) && err.code === MDBE_USER_NOT_FOUND) {
              err = null;
            }
            callback(err);
          })],
        addUser: ['removeUser', (results, callback) => _addLocalUser(
          localClient, config.mongodb.username, config.mongodb.password,
          config.mongodb.writeOptions, callback)]
      }, callback);
    }],
    // TODO: refactor to avoid removing user; driver doesn't seem to provide
    // high-level calls for granting roles, etc.
    removeUser: ['auth', (results, callback) => client.removeUser(
      config.mongodb.username, err => {
        // ignore user not found
        if(api.isDatabaseError(err) && err.code === MDBE_USER_NOT_FOUND) {
          err = null;
        }
        callback(err);
      })],
    addUser: ['removeUser', (results, callback) => client.addUser(
      config.mongodb.username, config.mongodb.password, _getAddUserOptions(),
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
          'default': 'admin'
        },
        password: {
          description: 'Enter the MongoDB administrator password',
          pattern: /^.{8,}$/,
          message: 'The password must be at least 8 characters.',
          hidden: true,
          'default': 'password'
        }
      }
    }, callback);
}

function _getAddUserOptions() {
  const local = bedrock.config.mongodb.local;
  return bedrock.util.extend({}, bedrock.config.mongodb.writeOptions, {
    roles: [
      'dbOwner',
      {role: 'dbAdmin', db: local.name, collection: local.collection},
      {role: 'readWrite', db: local.name, collection: local.collection}
    ]
  });
}

function _usesRoles(serverInfo) {
  // >= Mongo 2.6 uses user roles
  return (
    (serverInfo.versionArray[0] == 2 && serverInfo.versionArray[1] >= 6) ||
    (serverInfo.versionArray[0] > 2));
}

function _addLocalUser(client, username, password, writeOptions, callback) {
  client.addUser(username, password, writeOptions, err => {
    // Note: Code below is from node-native-mongodb but instead always does
    // user insert rather than an upsert; this behavior follows MongoDB >= 2.4
    // and avoids a duplicate key error when writing a local user that
    // occurs because a null _id key is used when upserting (vs. inserting)
    if(err && api.isDuplicateError(err)) {
      // clear duplicate error and try insert below
      err = null;
    }

    // Use node md5 generator
    const md5 = crypto.createHash('md5');
    // Generate keys used for authentication
    md5.update(username + ':mongo:' + password);
    const userPassword = md5.digest('hex');
    // Fetch a user collection
    const collection = client.collection('system.users');
    // Check if we are inserting the first user
    collection.count({}, err => {
      // We got an error (f.ex not authorized)
      if(err) {
        return callback(err, null);
      }
      // Check if the user already exists w/same password
      collection.findOne({user: username, pwd: userPassword}, (err, result) => {
        // We got an error (f.ex not authorized)
        if(err) {
          return callback(err, null);
        }
        // user already exists, continue
        if(result) {
          return callback(null, [{user: username, pwd: userPassword}]);
        }
        // insert new user
        collection.insert(
          {user: username, pwd: userPassword}, writeOptions, err => {
            if(err) {
              return callback(err, null);
            }
            callback(null, [{user: username, pwd: userPassword}]);
          });
      });
    });
  });
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
  api.client.collections((skip, collections) => {
    async.each(collections, (collection, callback) => {
      if(collection.s.name === 'system.indexes') {
        return callback();
      }
      if(cArray.length > 0 && cArray.indexOf(collection.s.name) == -1) {
        return callback();
      }
      logger.debug(`dropping collection: ${collection.s.namespace}`);
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
