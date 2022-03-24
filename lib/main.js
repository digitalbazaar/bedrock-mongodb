/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from 'bedrock';
import * as urls from './urls.js';
import {isAlreadyExistsError, isDatabaseError} from './helpers.js';
import {logger} from './logger.js';
import {loginUser} from './authn.js';
import {MDBE_AUTHN_FAILED, MDBE_AUTHZ_FAILED} from './exceptions.js';
import mongo from 'mongodb';
import {promptToCreateUser} from './cli.js';
import semver from 'semver';

const {MongoClient} = mongo;
const {util: {BedrockError, callbackify: brCallbackify}} = bedrock;

// load config defaults
import './config.js';

export * from './helpers.js';

// NOTE: this should only be altered by the bedrock-cli.ready event
let testMode = false;

// full database client API
let _client = null;
// database portion of client API
let _db = null;
// shared collections cache
const _collections = {};
export {_client as client, _db as db, _collections as collections};

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

async function _init() {
  const config = bedrock.config.mongodb;

  if(!config.url) {
    config.url = urls.create(config);
  }

  try {
    // initialize the database just once via a single worker
    await bedrock.runOnce('bedrock-mongodb.init', _initDatabase);

    // open database
    logger.info('opening database', {url: urls.sanitize(config.url)});
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
        url: urls.sanitize(config.url)
      }, e);
  }
}

async function _initDatabase() {
  const config = bedrock.config.mongodb;

  // connect to dbs
  let client;

  logger.info('initializing database', {url: urls.sanitize(config.url)});

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
            url: urls.sanitize(config.url)
          }, e);
      }
    }

    if(needsPrompt) {
      // prompt to try creating database user
      await promptToCreateUser();
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
