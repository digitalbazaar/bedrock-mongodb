/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as urls from './urls.js';
import {isAlreadyExistsError, isAuthenticationError} from './helpers.js';
import {logger} from './logger.js';
import mongo from 'mongodb';
import {openDatabase} from './authn.js';

const {util: {BedrockError}} = bedrock;

// load config defaults
import './config.js';

// NOTE: this should only be altered by the bedrock-cli.ready event
let testMode = false;

// full database client API
let _client = null;
// database portion of client API
let _db = null;
// shared collections cache
const _collections = {};
export {_client as client, _db as db, _collections as collections};

// export all helpers
export * from './helpers.js';

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
export async function openCollections(names) {
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
export async function createIndexes(options) {
  await Promise.all(options.map(
    async item => _collections[item.collection].createIndex(
      item.fields, item.options)));
}

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
    const {client, db} = await openDatabase({url: config.url, init: false});

    _client = client;
    _db = db;

    // drop any collections as requested
    if(testMode && config.dropCollections.onInit) {
      await _dropCollections();
    }
  } catch(error) {
    logger.error('could not initialize database', {error});
    throw new BedrockError(
      'Could not initialize database.',
      'DatabaseError', {
        url: urls.sanitize(config.url)
      }, error);
  }
}

async function _initDatabase() {
  const config = bedrock.config.mongodb;

  // connect to dbs
  let client;

  logger.info('initializing database', {url: urls.sanitize(config.url)});

  try {
    try {
      ({client} = await openDatabase({url: config.url, init: true}));
    } catch(e) {
      if(isAuthenticationError(e)) {
        // auth failed, either DB didn't exist or bad credentials
        logger.info('database authentication failed:' +
          ' db=' + config.name +
          ' username=' + config.username);
      }
      throw new BedrockError(
        'Could not initialize database.',
        'DatabaseError', {
          url: urls.sanitize(config.url),
        }, e);
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
