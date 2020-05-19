/*
 * Copyright (c) 2012-2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const mongo = require('mongodb');
const util = require('util');
const bedrock = require('bedrock');
const database = require('./index');

const api = {};
module.exports = api;

/**
 * A DistributedIdGenerator generates unique identifiers in a safe,
 * distributed, and fairly quick fashion. An ID that is generated using this
 * object should not conflict with any other ID generated using the same API
 * in the same ID namespace, even if that ID was generated on a different
 * machine.
 *
 * The underlying assumption that prevents ID collisions is that there is
 * a shared table (amongst all machines) with synchronized write access. This
 * table is only hit once the local ID namespace is exhausted, which should
 * be very rare.
 *
 * A distributed ID looks like:
 *
 * <version>.<globalId>.<localId>.<currentId>
 *
 * Where '.' is the reserved separator character. The global ID is stored
 * in a shared database and can only be updated atomically.
 *
 * The version is hardcoded to 1. The local ID can be any combination of
 * alphanumeric characters not including ".". The "." character was chosen
 * instead of "-" or "_" because those characters are used in URL-safe base64
 * encodings. This allows global ID and local ID parts to be encoded in base64,
 * however, they are encoded in hex in this implementation as is the current ID.
 */
api.DistributedIdGenerator = function() {
  this.namespace = null;
  this.globalId = null;
  this.localId = null;
  this.currentId = null;
  this.loading = false;
};

/**
 * Initializes this generator.
 *
 * @param namespace a unique namespace for the IDs.
 * @param callback(err) called once the operation completes.
 */
api.DistributedIdGenerator.prototype.init = function(namespace, callback) {
  const self = this;
  self.namespace = namespace;
  _loadIds(self, callback);
};

/**
 * Generates a new unique ID. The ID that is generated is URL-safe, but
 * is not itself a URL. It will be of the format "<hex>.<hex>.<hex>".
 *
 * @param callback(err, id) called once the operation completes.
 */
api.DistributedIdGenerator.prototype.generateId = function(callback) {
  const self = this;
  async.waterfall([
    // wait for another call to finish loading the IDs
    callback => async.whilst(
      () => self.loading, callback => setImmediate(callback), callback),
    callback => {
      if(self.loading) {
        // loading IDs again, retry generation
        return self.generateId(callback);
      }

      // maximum ID reached, reload IDs and retry generate
      if(self.currentId.isMax()) {
        return _loadIds(self, () => process.nextTick(() =>
          self.generateId(callback)));
      }

      // get next ID
      // big-endian hex-encode ID
      // version is hard-coded to 1
      const id = util.format('1.%s.%s.%s',
        _stripLeadingZeros(self.globalId.toHex()),
        _stripLeadingZeros(self.localId.toHex()),
        _stripLeadingZeros(self.currentId.next().toHex()));
      callback(null, id);
    }
  ], callback);
};

/**
 * A 64-bit ID (emulated using two 32-bit numbers).
 *
 * @param low the low 32-bits.
 * @param high the high 32-bits.
 */
const Id64 = function() {
  this.low = this.high = 0;
  if(arguments.length > 0) {
    if(typeof arguments[0] === 'number') {
      this.low = arguments[0] & 0xffffffff;
      if(arguments.length > 1 && arguments[1] instanceof Number) {
        this.high = arguments[1] & 0xffffffff;
      }
    } else if(typeof arguments[0] === 'string') {
      this.low = parseInt(arguments[0].substr(8), 16);
      this.high = parseInt(arguments[0].substr(0, 8), 16);
    }
  }
};

/**
 * Gets the next ID.
 *
 * @return this ID for chaining.
 */
Id64.prototype.next = function() {
  if(this.low === 0xffffffff) {
    if(this.high === 0xffffffff) {
      // overflow
      this.high = this.low = 0;
    } else {
      this.high += 1;
      this.low = 0;
    }
  } else {
    this.low += 1;
  }
  return this;
};

/**
 * Returns true if this ID has reached its maximum value.
 *
 * @return true if this ID is the max ID value, false if not.
 */
Id64.prototype.isMax = function() {
  return this.high === 0xffffffff && this.low === 0xffffffff;
};

/**
 * Returns the 64-bit value of this ID in hex.
 *
 * @return the 64-bit value of this ID in hex.
 */
Id64.prototype.toHex = function() {
  // strip beginning zeros
  return _u32toHex(this.high) + _u32toHex(this.low);
};

/**
 * Converts an unsigned 32-bit number to zero-filled hex.
 *
 * @param u32 the number to convert.
 *
 * @return the hex representation of the number.
 */
function _u32toHex(u32) {
  const hex = u32.toString(16);
  return '0000000'.substr(0, 8 - hex.length) + hex;
}

/**
 * Strips leading zeros from the given hex.
 *
 * @param hex the hex to strip leading zeros from.
 *
 * @return the stripped hex.
 */
function _stripLeadingZeros(hex) {
  return hex.replace(/^0+/, '');
}

/**
 * Loads the global and local IDs from machine-local (non-replicated) storage,
 * assigning a new global ID and local ID as necessary.
 *
 * The global ID cached in local storage is shared amongst all processes
 * and machines that share the same database server. The local ID in local
 * storage represents the last assigned local ID and it will be incremented
 * and updated in the database when this method is called. This method is only
 * called on initialization and once the current ID namespace is exhausted in
 * a particular process.
 *
 * @param idGenerator the ID generator load IDs for.
 * @param callback(err) called once the operation completes.
 */
function _loadIds(idGenerator, callback) {
  // reset IDs
  idGenerator.globalId = null;
  idGenerator.localId = null;
  idGenerator.currentId = null;
  idGenerator.loading = true;

  // get keys for local storage
  const distIdKey = 'local.distributedId.' + idGenerator.namespace;
  const globalKey = distIdKey + '.global';
  const localKey = distIdKey + '.local';

  async.waterfall([
    callback => {
      // skip if no local collection
      if(!database.localCollection) {
        return callback(null, null);
      }
      // try to get cached global and local ID from local storage
      const query = {};
      query.id = database.localDocumentId;
      query[globalKey] = {$exists: true};
      query[localKey] = {$exists: true};
      const fields = {};
      fields[globalKey] = true;
      fields[localKey] = true;
      database.localCollection.findOne(query, fields, (err, record) => {
        if(err) {
          return callback(err);
        }
        callback(null, record ?
          record.local.distributedId[idGenerator.namespace] : null);
      });
    },
    (id, callback) => {
      // cached global ID and local ID found
      let localId = null;
      if(id) {
        // get unique local ID
        localId = new Id64(id.local);
        if(localId.isMax()) {
          // local ID space exhausted
          localId = null;
        }
      }

      // cached IDs found
      if(localId !== null) {
        // get next local ID
        localId.next();

        // update local database if ID hasn't changed
        const query = {};
        query[globalKey] = id.global;
        query[localKey] = id.local;
        const update = {$set: {}};
        update.$set[localKey] = localId.toHex();
        return database.localCollection.updateMany(
          query, update, database.localWriteOptions, (err, result) => {
            if(err) {
              return callback(err);
            }
            if(result.n === 0) {
              // local ID already assigned to a different process, try again
              return process.nextTick(() => _loadIds(idGenerator, callback));
            }
            // local ID assignment successful, store global ID too
            idGenerator.globalId = new Id64(id.global);
            idGenerator.localId = localId;
            idGenerator.currentId = new Id64();
            idGenerator.loading = false;
            callback();
          });
      }

      // no global ID yet or local ID space exhausted, assign a new one
      database.collections.distributedId.findAndModify(
        {namespace: idGenerator.namespace},
        [['_id', 'asc']],
        {$inc: {id: new mongo.Long(1)}},
        bedrock.util.extend({}, database.writeOptions,
          {new: true, upsert: true}),
        (err, result) => {
          if(err) {
            if(database.isDuplicateError(err)) {
              // another process upserted the new key, retry
              process.nextTick(() => _loadIds(idGenerator, callback));
              return;
            }
            return callback(err);
          }

          /* Atomically write the new global ID and local ID to local storage.
          In rare cases, other locally running processes might request
          new global IDs concurrently, in which case we only update the
          local ID cache if it doesn't yet exist or if the existing global
          ID is less than the one we generated here. */
          const globalId = new Id64(result.value.id);
          const localId = new Id64(1);
          if(!database.localCollection) {
            idGenerator.globalId = globalId;
            idGenerator.localId = localId;
            idGenerator.currentId = new Id64();
            idGenerator.loading = false;
            return callback();
          }
          const query = {};
          query.id = database.localDocumentId;
          query.$or = [
            {globalKey: {$exists: false}},
            {globalKey: {$lt: globalId.toHex()}}
          ];
          const update = {$set: {}};
          update.$set[globalKey] = globalId.toHex();
          update.$set[localKey] = localId.toHex();
          database.localCollection.findAndModify(
            query, [['id', 'asc']], update, database.localWriteOptions,
            (err, result) => {
              if(err) {
                return callback(err);
              }
              // changes made, new global ID assignment successful
              if(result.value) {
                idGenerator.globalId = globalId;
                idGenerator.localId = localId;
                idGenerator.currentId = new Id64();
                idGenerator.loading = false;
                return callback();
              }
              // no changes were made, re-load IDs as another process
              // already stored a new global ID in the local cache
              process.nextTick(() => _loadIds(idGenerator, callback));
            });
        });
    }
  ], callback);
}

