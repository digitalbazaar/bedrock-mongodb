/*!
 * Copyright 2012 - 2025 Digital Bazaar, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as bedrock from '@bedrock/core';
import crypto from 'node:crypto';
import {
  MDBE_AUTHN_FAILED,
  MDBE_ERRORS,
  MDBE_DUPLICATE,
  MDBE_DUPLICATE_ON_UPDATE
} from './exceptions.js';

// load config defaults
import './config.js';

// Note: exporting `writeOptions` is deprecated
// and will be removed in release 9.0
// default database write options
export const writeOptions = bedrock.config.mongodb.writeOptions;

/**
 * Creates a hash of a key that can be indexed.
 *
 * @param {string} key - The key to hash.
 *
 * @returns {string} - The hash.
 */
export function hash(key) {
  if(typeof key !== 'string') {
    throw new TypeError('"key" must be a string.');
  }
  return crypto.createHash('sha256').update(key, 'utf8').digest('base64');
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
  } else if(value && typeof value === 'object') {
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
  } else if(value && typeof value === 'object') {
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
  return err?.message?.includes('already exists');
}

/**
 * Returns true if the given error is a MongoDB authentication error.
 *
 * @param {Error} err - The error to check.
 *
 * @returns {boolean} True if the error is an authentication error, false if
 *   not.
 */
export function isAuthenticationError(err) {
  return isDatabaseError(err) && (err.code === MDBE_AUTHN_FAILED ||
    err.message === 'could not authenticate');
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
