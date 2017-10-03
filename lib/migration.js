/*
 * Copyright (c) 2012-2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const config = bedrock.config;
const database = require('./database');
const progress = require('progress');

const BedrockError = bedrock.util.BedrockError;

const logger = bedrock.loggers.get('app');

const api = {};
module.exports = api;

// steps per progress bar tick call optimization
const PROCESSED_PER_TICK = 20;

/**
 * Exported function to run test code via Bedrock.
 *
 * @param callback callback when system started. Will not be started if an
 *   error occurred.
 */
api.main = callback => {
  // setup common migration options
  bedrock.events.on('bedrock-cli.init', () => bedrock.program
    .option('--print-objects', 'Print out changed objects.')
    .option('--progress', 'Print progress.'));
  bedrock.events.on('bedrock-cli.ready', callback => {
    if(bedrock.program.config.length === 0) {
      return callback(new BedrockError(
        'Database setup via the --config option is required.',
        'ConfigurationError'
      ));
    }
    callback();
  });
  bedrock.start(err => {
    const c = config.mongodb;
    logger.info('DB %s@%s:%s', c.name, c.host, c.port);
    if(err) {
      // wrap non-bedrock errors
      if(!(err instanceof BedrockError)) {
        err = new BedrockError(
          'A migration error occurred.',
          'bedrock.migration.Error', null, err);
      }
      console.error('Migration error:', JSON.stringify(
        err.toObject(), null, 2));
      console.error('Exiting.');
      process.exit(1);
    }
    callback();
  });
};

/**
 * Helper to print objects.
 *
 * @param obj object to print.
 */
api.printObject = obj => {
  if(bedrock.program.printObjects) {
    logger.debug(obj);
  }
};

/**
 * Called whenever the migration is complete.
 *
 * @param err the error if there was one
 * @param results the set of results, which are ignored
 */
api.complete = err => {
  if(err) {
    logger.error('MongoDB migration failed:', err);
    // FIXME improve bedrock shutdown method
    process.exit(1);
  }
  logger.info('MongoDB migration complete.');
  // FIXME improve bedrock shutdown method
  process.exit();
};

/**
 * Run function on every element of a table.
 *
 * The functions are called in order if present:
 * 'read': read all objects.
 * 'update' mutate objects in place. call callback with false to avoid writing
 *
 * options:
 *   collection: database collection (string)
 *   ready: function called before processing (function({collection:}))
 *   update: function called for each element to edit in place
 *     (function(item, callback(err, [update])))
 *   callback: called when done (function(err, results))
 *     results: FIXME object with processing results, etc
 */
api.each = options => {
  async.auto({
    // open collections
    collection: callback => database.openCollections(
      [options.collection], err => {
        if(err) {
          return callback(err);
        }
        callback(null, database.collections[options.collection]);
      }),
    ready: ['collection', (results, callback) => {
      if('ready' in options) {
        return options.ready({collection: results.collection}, callback);
      }
      callback();
    }],
    count: ['ready', (results, callback) => {
      if(!bedrock.program.progress) {
        return callback();
      }
      results.collection.find({}, (err, cursor) =>
        cursor.count((err, count) => {
          if(err) {
            return callback(err);
          }
          logger.info(options.collection + ' count=' + count);
          callback(null, count);
        }));
    }],
    read: ['count', (results, callback) => {
      if(!options.read) {
        return callback();
      }
      let readProgress;
      if(bedrock.program.progress && results.count > 0) {
        readProgress = new progress(
          '  ' + options.collection +
          ' read [:bar] :current/:total (:percent) :etas', {
            total: results.count,
            width: 20
          });
        readProgress.tick(0);
      }
      results.collection.find({}, (err, cursor) => {
        if(err) {
          return callback(err);
        }
        let done = false;
        let processed = 0;
        let processedSinceTick = 0;
        async.until(
          () => done, callback => cursor.nextObject((err, record) => {
            if(err) {
              return callback(err);
            }
            if(!record) {
              done = true;
              return callback();
            }
            try {
              options.read(record, err => {
                if(err) {
                  return callback(err);
                }
                if(bedrock.program.progress && results.count > 0) {
                  processed++;
                  processedSinceTick++;
                  if(processedSinceTick === PROCESSED_PER_TICK ||
                    processed === results.count) {
                    readProgress.tick(processedSinceTick);
                    processedSinceTick = 0;
                  }
                }
                // FIXME: prevent stack overflow
                // process.nextTick(function() {
                //  callback();
                // });
                callback();
              });
            } catch(e) {
              logger.error('Read error for ObjectId:', record._id);
              throw e;
            }
          }), callback);
      });
    }],
    update: ['read', (results, callback) => {
      if(!options.update) {
        return callback();
      }
      let updateProgress;
      if(bedrock.program.progress && results.count > 0) {
        updateProgress = new progress(
          '  ' + options.collection +
          ' update [:bar] :current/:total (:percent) :etas', {
            total: results.count,
            width: 20
          });
        updateProgress.tick(0);
      }
      results.collection.find({}, (err, cursor) => {
        if(err) {
          return callback(err);
        }
        let done = false;
        let processed = 0;
        let processedSinceTick = 0;
        function _processed() {
          if(bedrock.program.progress && results.count > 0) {
            processed++;
            processedSinceTick++;
            if(processedSinceTick === PROCESSED_PER_TICK ||
                processed === results.count) {
              updateProgress.tick(processedSinceTick);
              processedSinceTick = 0;
            }
          }
        }
        async.until(
          () => done, callback => cursor.nextObject((err, record) => {
            if(err) {
              return callback(err);
            }
            if(!record) {
              done = true;
              return callback();
            }
            try {
              options.update(record, (err, doUpdate) => {
                if(err) {
                  return callback(err);
                }
                // checking for explicit 'false' flag to skip update
                if(doUpdate !== false) {
                  return results.collection.update({
                    _id: record._id
                  }, record, err => {
                    _processed();
                    callback(err);
                  });
                }
                _processed();
                callback();
              });
            } catch(e) {
              logger.error('Update error for ObjectId:', record._id);
              throw e;
            }
          }), callback);
      });
    }],
    done: ['update', (results, callback) => callback()]
  }, (err, results) => {
    if(err) {
      logger.error('ERROR', err);
    }
    if('callback' in options) {
      options.callback(null, results);
    }
  });
};

/**
 * Simple form of each() that just has a read(record, callback) call.
 *
 * @param name collection name
 * @param readRecord function(record, callback(err)) that reads a record
 * @param callback callback(err) after done
 */
api.eachRead = (name, readRecord, callback) => api.each({
  collection: name,
  ready: (options, callback) => {
    logger.info('Reading "' + name + '" collection.');
    callback();
  },
  read: (record, callback) => {
    readRecord(record, callback);
  },
  callback: err => {
    if(!err) {
      logger.info('db.' + name + ' read.');
    }
    callback(err);
  }
});

/**
 * Simple form of each() that just has an update(record, callback) call.
 *
 * @param name collection name
 * @param updateRecord function(record, callback(err)) that mutates a record
 *          in place
 * @param callback callback(err) after done
 */
api.eachUpdate = (name, updateRecord, callback) => api.each({
  collection: name,
  ready: (options, callback) => {
    logger.info('Fixing "' + name + '" collection.');
    callback();
  },
  update: (record, callback) => {
    updateRecord(record, callback);
  },
  callback: err => {
    if(!err) {
      logger.info('db.' + name + ' upgraded.');
    }
    callback(err);
  }
});

/**
 * Drop a collection and all its indexes.
 * WARNING: Dangerous!
 *
 * @param name collection name
 * @param callback callback(err) after done
 */
// FIXME: could simplify this but just build on migration.each for now
api.dropCollection = (name, callback) => api.each({
  collection: name,
  ready: (options, callback) => {
    logger.info('Dropping "' + name + '" collection.');
    options.collection.drop(callback);
  },
  callback: err => {
    if(!err) {
      logger.info('db.' + name + ' dropped.');
    }
    callback(err);
  }
});

/**
 * Drop indexes for a collection.
 * WARNING: Dangerous!
 *
 * @param name collection name
 * @param callback callback(err) after done
 */
// FIXME: could simplify this but just build on migration.each for now
api.dropIndexes = (name, callback) => api.each({
  collection: name,
  ready: (options, callback) => {
    logger.info('Dropping indexes for the "' + name + '" collection.');
    options.collection.dropIndexes(callback);
  },
  callback: err => {
    if(!err) {
      logger.info('Indexes for db.' + name + ' dropped.');
    }
    callback(err);
  }
});

/**
 * Update object property names.
 *
 * @param obj the object to manipulate.
 * @param propMap object with mapping from old to new names.
 * @param options optional options
 *          deep boolean to do deep rename
 * @param callback callback(err) after done
 */
api.renameProperties = (obj, propMap, options, callback) => {
  if(!callback) {
    callback = options;
    options = {};
  }
  _rename(obj, obj, propMap, options);
  callback();
};

/**
 * Update a single record
 * @param [options] the options to use
 *   [collection] string the database collection name
 *   [id] string the unique ID of the record to update
 *   [update] function the function to update the record
 * @callback callback(err) after done
 */
api.updateOne = (options, callback) => async.auto({
  // open collections
  collection: callback => database.openCollections(
    [options.collection], err => {
      if(err) {
        return callback(err);
      }
      callback(null, database.collections[options.collection]);
    }),
  read: ['collection', (results, callback) => {
    const query = {id: database.hash(options.id)};
    results.collection.findOne(query, callback);
  }],
  update: ['read', (results, callback) => {
    const record = results.read || null;
    if(!record) {
      return callback(new BedrockError(
        'Record not found.', 'NotFound', {id: options.id}));
    }
    if(!options.update) {
      return callback();
    }
    try {
      options.update(record, (err, doUpdate) => {
        if(err) {
          return callback(err);
        }
        // checking for explicit 'false' flag to skip update
        if(doUpdate !== false) {
          return results.collection
            .update({_id: record._id}, record, callback);
        }
        logger.debug('No update required to:', record.id);
        callback();
      });
    } catch(e) {
      logger.error('Update error for ObjectId:', record._id);
      throw e;
    }
  }]
}, err => {
  if(err) {
    logger.error('ERROR', err);
    return callback(err);
  }
  callback();
});

function _rename(root, obj, propMap, options) {
  if(_.isArray(obj)) {
    if(options.deep) {
      _.each(obj, element => _rename(root, element, propMap, options));
    }
  } else if(_.isObject(obj)) {
    // do replacement on properties
    _.each(propMap, (newProp, oldProp) => {
      // use json tests vs jsonld.hasProperty since we want to change
      // the name even when no values exist for that property and
      // hasProperty would return false..
      if(oldProp in obj) {
        if(newProp in obj) {
          throw new Error('Object ' + root.id +
            ' has old (' + oldProp + ')' +
            ' and new (' + newProp + ') properties');
        }
        obj[newProp] = obj[oldProp];
        delete obj[oldProp];
      }
    });
    if(options.deep) {
      _.each(obj, value => _rename(root, value, propMap, options));
    }
  }
}
