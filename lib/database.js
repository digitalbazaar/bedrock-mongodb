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
 * Copyright (c) 2012-2015 Digital Bazaar, Inc. All rights reserved.
 */
var async = require('async');
var crypto = require('crypto');
var mongo = require('mongodb');
var bedrock = require('bedrock');
var BedrockError = bedrock.tools.BedrockError;

// load config defaults
require('./config');

// constants
var MODULE_NS = 'bedrock.mongodb';

// exceptions
var MDBE_ERROR = 'MongoError';
var MDBE_AUTH_FAILED = 18;
var MDBE_DUPLICATE = 11000;
var MDBE_DUPLICATE_ON_UPDATE = 11001;
var MDBE_USER_NOT_FOUND = 11;

// module API
var api = {};
module.exports = api;

// database client(s)
api.client = null;
api.localClient = null;

// shared collections cache
api.collections = {};

// local collection
api.localCollection = null;
// local document ID
api.localDocumentId = 'local';

// default database write options
api.writeOptions = bedrock.config.mongodb.writeOptions;
api.localWriteOptions = bedrock.config.mongodb.local.writeOptions;

// distributed ID generator class
var DistributedIdGenerator;

// id generators
var idGenerators = {};

var logger = bedrock.loggers.get('app');

bedrock.events.on('bedrock.init', init);
bedrock.events.on('bedrock.test.configure', function() {
  // load test config
  require('./test.config');
});

function init(callback) {
  async.auto({
    initDatabase: function(callback) {
      bedrock.runOnce('bedrock-mongodb.init', _initDatabase, callback);
    },
    open: ['initDatabase', function(callback) {
      _openDatabase(bedrock.config.mongodb.name, {init: false}, callback);
    }],
    openLocal: ['initDatabase', function(callback) {
      _openDatabase(bedrock.config.mongodb.local.name, {init: false}, callback);
    }],
    openCollections: ['open', function(callback, results) {
      // open collections
      api.client = results.open;
      api.openCollections(['distributedId'], callback);
    }],
    createIndexes: ['openCollections', function(callback) {
      // setup indexes
      api.createIndexes([{
        collection: 'distributedId',
        fields: {namespace: true},
        options: {unique: true, background: true}
      }], callback);
    }],
    setupLocal: ['openLocal', function(callback, results) {
      // setup machine-local (non-replicated) database
      api.localClient = results.openLocal;
      _setupLocalDatabase(callback);
    }],
    emit: ['createIndexes', 'setupLocal', function(callback) {
      bedrock.events.emit('bedrock-mongodb.ready', callback);
    }]
  }, function(err) {
    if(err) {
      logger.error('could not initialize database', err);
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
api.openCollections = function(names, callback) {
  // remove collections that are already open
  var unopened = [];
  names.forEach(function(name) {
    if(!(name in api.collections)) {
      unopened.push(name);
    }
  });

  // create collections as necessary (ignore already exists error)
  async.forEach(unopened, function(name, callback) {
    logger.debug('creating collection: ' + name);
    api.client.createCollection(name, api.writeOptions,
      function ignoreAlreadyExists(err) {
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
    var collections = {};
    names.forEach(function(name) {
      if(!(name in api.collections)) {
        collections[name] = function(callback) {
          api.client.collection(name, callback);
        };
      }
    });

    // open collections
    logger.debug('opening collections', names);
    async.parallel(collections, function(err, results) {
      if(err) {
        return callback(err);
      }
      // merge results into collection cache
      for(var name in results) {
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
api.hash = function(key) {
  if(typeof key !== 'string') {
    throw new BedrockError(
      'Invalid key given to database hash method.',
      MODULE_NS + '.InvalidKey', {key: key});
  }
  var md = crypto.createHash('sha1');
  md.update(key, 'utf8');
  return md.digest('hex') + key.length.toString(16);
};

/**
 * Builds an update object using mongodb dot-notation.
 *
 * @param obj the object with fields to be updated in the database.
 * @param [field] optional db encoded parent field.
 * @param options options for building the update:
 *          include: dot-delimited fields to include, any not listed will be
 *            excluded.
 *          exclude: dot-delimited db encoded fields to exclude.
 *
 * @return the update object to be assigned to $set in an update query.
 */
api.buildUpdate = function(obj) {
  var options = null;
  var field = '';
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
  var rval = arguments[3] || {};
  if('exclude' in options && options.exclude.indexOf(field) !== -1) {
    return rval;
  }
  if('include' in options && field.indexOf('.') !== -1 &&
    options.include.indexOf(field) === -1) {
    return rval;
  }
  if(obj && typeof obj === 'object' && !Array.isArray(obj)) {
    // for objects, recurse for each field
    Object.keys(obj).forEach(function(name) {
      var dbName = api.encodeString(name);
      api.buildUpdate(obj[name], (field.length > 0) ?
        field + '.' + dbName : dbName, options, rval);
    });
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
api.createIndexes = function(options, callback) {
  async.forEach(options, function(item, callback) {
    api.collections[item.collection].ensureIndex(
      item.fields, item.options, callback);
  }, callback);
};

/**
 * Gets the DistributedIdGenerator for the given namespace. If the
 * DistributedIdGenerator object does not exist, it will be created.
 *
 * @param namespace the ID namespace.
 * @param callback(err, idGenerator) called once the operation completes.
 */
api.getDistributedIdGenerator = function(namespace, callback) {
  if(namespace in idGenerators) {
    return callback(null, idGenerators[namespace]);
  }

  // lazy load
  if(!DistributedIdGenerator) {
    DistributedIdGenerator = require('./idGenerator').DistributedIdGenerator;
  }

  // create and initialize ID generator
  var idGenerator = new DistributedIdGenerator();
  async.waterfall([
    function(callback) {
      idGenerator.init(namespace, callback);
    },
    function(callback) {
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
api.encodeString = function(value) {
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
api.encode = function(value) {
  var rval;
  if(Array.isArray(value)) {
    rval = [];
    value.forEach(function(e) {
      rval.push(api.encode(e));
    });
  } else if(bedrock.tools.isObject(value)) {
    rval = {};
    Object.keys(value).forEach(function(name) {
      rval[api.encodeString(name)] = api.encode(value[name]);
    });
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
api.decodeString = function(value) {
  return decodeURIComponent(value);
};

/**
 * Decodes any keys in the given value that were previously encoded because
 * they contained reserved MongoDB characters (or the '%' encode character).
 *
 * @param value the value to decode.
 *
 * @return the decoded result.
 */
api.decode = function(value) {
  var rval;
  if(Array.isArray(value)) {
    rval = [];
    value.forEach(function(e) {
      rval.push(api.decode(e));
    });
  } else if(bedrock.tools.isObject(value)) {
    rval = {};
    Object.keys(value).forEach(function(name) {
      rval[api.decodeString(name)] = api.decode(value[name]);
    });
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
  var name = bedrock.config.mongodb.local.collection;

  async.waterfall([
    function(callback) {
      // create local collection
      api.localClient.createCollection(name, api.localWriteOptions,
        function ignoreAlreadyExists(err) {
          if(err) {
            if(api.isAlreadyExistsError(err)) {
              err = null;
            }
            return callback(err);
          }
          logger.debug('local collection created: ' + name);
          callback();
      });
    },
    function(callback) {
      // open local collection
      api.localClient.collection(name, callback);
    },
    function(collection, callback) {
      // cache local collection
      api.localCollection = collection;

      // create index
      api.localCollection.ensureIndex(
        {id: true}, {unique: true, background: true}, function(err) {
          callback(err);
        });
    },
    function(callback) {
      // insert local document
      var record = {id: api.localDocumentId, local: {}};
      api.localCollection.insert(record, api.localWriteOptions,
        function(err) {
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
api.isAlreadyExistsError = function(err) {
  return (err && err.message && err.message.indexOf('already exists') !== -1);
};

/**
 * Returns true if the given error is a MongoDB duplicate key error.
 *
 * @param err the error to check.
 *
 * @return true if the error is a duplicate key error, false if not.
 */
api.isDuplicateError = function(err) {
  return (api.isDatabaseError(err) &&
    (err.code === MDBE_DUPLICATE || err.code === MDBE_DUPLICATE_ON_UPDATE));
};

/**
 * Returns true if the given error is a MongoDB error.
 *
 * @param err the error to check.
 *
 * @return true if the error is a duplicate key error, false if not.
 */
api.isDatabaseError = function(err) {
  return (err && err.name === MDBE_ERROR);
};

/**
 * A helper method for incrementing cycling update IDs.
 *
 * @param updateId the current update ID.
 *
 * @return the new update ID.
 */
api.getNextUpdateId = function(updateId) {
  return (updateId < 0xffffffff) ? (updateId + 1) : 0;
};

function _initDatabase(callback) {
  var config = bedrock.config.mongodb;
  logger.info('initializing database: mongodb://' +
    config.host + ':' + config.port + '/' + config.name);

  // connect to shared and local dbs
  var client;
  var localClient;
  async.auto({
    open: function(callback) {
      // TODO: merge similar callbacks below into single function
      _openDatabase(config.name, {init: true}, function(err, db) {
        client = db;
        if(!err) {
          return callback(null, true);
        }
        if(api.isDatabaseError(err) && err.code === MDBE_AUTH_FAILED) {
          // auth failed, either DB didn't exist or bad credentials
          logger.info('database authentication failed:' +
            ' db=' + config.name +
            ' username=' + config.username);
          if(config.adminPrompt) {
            return callback(null, false);
          }
        }
        callback(err);
      });
    },
    openLocal: function(callback) {
      _openDatabase(config.local.name, {init: true}, function(err, db) {
        localClient = db;
        if(!err) {
          return callback(null, true);
        }
        if(api.isDatabaseError(err) && err.code === MDBE_AUTH_FAILED) {
          // auth failed, either DB didn't exist or bad credentials
          logger.info('database authentication failed:' +
            ' db=' + config.local.name +
            ' username=' + config.username);
          if(config.adminPrompt) {
            return callback(null, false);
          }
        }
        callback(err);
      });
    },
    check: ['open', 'openLocal', function(callback, results) {
      // open and authenticated, finish
      if(results.open && results.openLocal) {
        return callback();
      }
      // try to create user
      _createUser(client, localClient, callback);
    }]
  }, function(err) {
    // force clients to close (do not reuse connections)
    async.auto({
      close: function(callback) {
        if(!client) {
          return callback();
        }
        client.close(true, function() {
          callback();
        });
      },
      closeLocal: function(callback) {
        if(!localClient) {
          return callback();
        }
        localClient.close(true, function() {
          callback();
        });
      }
    }, function() {
      callback(err);
    });
  });
}

function _openDatabase(name, options, callback) {
  var config = bedrock.config.mongodb;
  if(!options.init) {
    logger.info('connecting to database: mongodb://' +
      config.host + ':' + config.port + '/' + name);
  }
  var db = new mongo.Db(name, new mongo.Server(
    config.host, config.port, config.connectOptions),
    config.options);
  async.auto({
    connect: function(callback) {
      db.open(function(err) {
        if(!err && !options.init) {
          logger.debug('connected to database: mongodb://' +
            config.host + ':' + config.port + '/' + name);
        }
        callback(err);
      });
    },
    serverInfo: ['connect', function(callback) {
      db.admin().serverInfo(callback);
    }],
    auth: ['serverInfo', function(callback, results) {
      if(_usesRoles(results.serverInfo)) {
        // authenticate against shared db
        return db.authenticate(
          config.username, config.password, {authdb: config.name},
          callback);
      }
      // backwards-compatible mode; auth using opened db
      db.authenticate(
        config.username, config.password, {authdb: name},
        callback);
    }]
  }, function(err) {
    callback(err, db);
  });
}

function _createUser(client, localClient, callback) {
  var config = bedrock.config;

  console.log('\nA new, upgrade, or incomplete database setup scenario ' +
    'has been detected. To ensure the database "' + config.mongodb.name +
    '" exists and its primary user "' + config.mongodb.username + '" ' +
    'exists and has sufficient access privileges, please enter the ' +
    'following information.');

  async.auto({
    prompt: function(callback) {
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
    },
    auth: ['prompt', function(callback, results) {
      // authenticate w/server as admin
      client.authenticate(
        results.prompt.username, results.prompt.password,
        {authdb: 'admin'}, callback);
    }],
    serverInfo: ['auth', function(callback) {
      client.admin().serverInfo(callback);
    }],
    addLocalUser: ['serverInfo', function(callback, results) {
      // skip if user roles are used as they will provide access to local db
      if(_usesRoles(results.serverInfo)) {
        return callback();
      }
      async.auto({
        auth: function(callback) {
          // authenticate w/server as admin
          localClient.authenticate(
            results.prompt.username, results.prompt.password,
            {authdb: 'admin'}, callback);
        },
        removeUser: ['auth', function(callback) {
          localClient.removeUser(config.mongodb.username, function(err) {
            // ignore user not found
            if(api.isDatabaseError(err) && err.code === MDBE_USER_NOT_FOUND) {
              err = null;
            }
            callback(err);
          });
        }],
        addUser: ['removeUser', function(callback) {
          localClient.addUser(
            config.mongodb.username, config.mongodb.password,
            config.mongodb.writeOptions, callback);
        }]
      }, callback);
    }],
    // TODO: refactor to avoid removing user; driver doesn't seem to provide
    // high-level calls for granting roles, etc.
    removeUser: ['auth', function(callback) {
      client.removeUser(config.mongodb.username, function(err) {
        // ignore user not found
        if(api.isDatabaseError(err) && err.code === MDBE_USER_NOT_FOUND) {
          err = null;
        }
        callback(err);
      });
    }],
    addUser: ['removeUser', function(callback) {
      client.addUser(
        config.mongodb.username, config.mongodb.password,
        _getAddUserOptions(), callback);
    }]
  }, callback);
}

function _getAddUserOptions() {
  var local = bedrock.config.mongodb.local;
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
  return serverInfo.versionArray[0] >= 2 && serverInfo.versionArray[1] >= 6;
}
