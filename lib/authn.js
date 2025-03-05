/*!
 * Copyright 2012 - 2024 Digital Bazaar, Inc.
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
import * as urls from './urls.js';
import {logger} from './logger.js';
import {MDBE_AUTHZ_FAILED} from './exceptions.js';
import mongo from 'mongodb';
import semver from 'semver';
import {klona} from 'klona';

const {MongoClient} = mongo;
const {util: {BedrockError}} = bedrock;

export async function openDatabase(options) {
  const config = bedrock.config.mongodb;

  const opts = {
    connectOptions: {...config.connectOptions},
    writeOptions: {...config.writeOptions},
    ...options
  };

  if(config.url) {
    opts.url = config.url;
  } else {
    // `config.url` not specified; create `opts.url` from the `config` and
    // set other necessary options from the config
    opts.url = urls.create(config);
    opts.database = config.name;
    opts.authentication = {...config.authentication};
  }

  // do unauthenticated connection to mongo server to check
  // server compatibility and authn requirements
  const {admin} = await _getUnauthenticatedDb({config: klona(config)});
  const serverInfo = await admin.serverInfo(null);
  _checkServerVersion({serverInfo, config});

  // do auth check and add additional params if `config.url` is not set
  if(!config.url) {
    // makes an unauthenticated call to the server to see if auth is required
    const authRequired = await _isAuthnRequired({config, admin});

    // if `authRequired`, create an auth object for Mongo; otherwise, `auth`
    // will be passed as `null` and success will rely on other config options
    if(authRequired) {
      _addAuthOptions({options: opts, config});
    }
  }

  // connect to database and get server info
  return _connect(opts);
}

/**
 * Connects to the database with authentication if provided.
 *
 * @private
 * @param {object} options - Connection options.
 *
 * @returns {Promise<object>} Returns the client & db.
 */
async function _connect(options) {
  if(!options.init) {
    logger.info('connecting to database: ' + urls.sanitize(options.url));
  }
  const {writeConcern} = options.writeOptions;
  let connectOptions = {...options.connectOptions, writeConcern};
  // socket related options used to be an object
  // they are now just general options in connectOptions
  if('socketOptions' in options.connectOptions) {
    connectOptions = {
      ...connectOptions,
      ...options.connectOptions.socketOptions
    };
    delete connectOptions.socketOptions;
  }
  const client = await MongoClient.connect(options.url, connectOptions);
  const db = client.db();
  const ping = await db.admin().ping();
  logger.debug('database connection succeeded: db=' + db.databaseName, {ping});
  return {client, db};
}

/**
 * Determines if authn is required.
 *
 * @see
 * https://mongodb.github.io/node-mongodb-native/3.7/api/Admin.html
 * #listDatabases
 * @private
 * @param {object} options - Options to use.
 * @param {object} options.config - The mongodb config.
 * @param {object} options.admin - A Mongo driver Admin class.
 *
 * @returns {Promise<boolean>} Is authRequired?
 */
async function _isAuthnRequired({config, admin}) {
  if(config.forceAuthentication) {
    return true;
  }
  try {
    // if listing databases fails on authz, then authentication is required
    await admin.listDatabases();
  } catch(e) {
    if(e?.code === MDBE_AUTHZ_FAILED) {
      return true;
    }
    // some other error, abort
    throw e;
  }
  return false;
}

function _addAuthOptions({options, config}) {
  options.connectOptions.auth = {
    username: config.username,
    password: config.password
  };
  // authSource is the database to authenticate against
  // this is usually `admin` in dev and a specific db in production
  options.connectOptions.authSource =
    config.connectOptions.authSource || options.database;
  return options;
}

/**
 * Establishes an unauthenticated connection to the server.
 *
 * @private
 * @param {object} options - Options to use.
 * @param {object} options.config - Config options.
 *
 * @returns {Promise<object>} Returns an object with the db and admin.
 */
async function _getUnauthenticatedDb({config}) {
  // only use the config stuff with out auth credentials
  const opts = {
    ...config.connectOptions,
    ...config.writeOptions,
  };
  // if authSource is defined just delete it here
  delete opts.authSource;
  const urlParts = new URL(config.url || '');
  // remove any parts of the url that could contain authorization data
  const url = `${urlParts.protocol}//${urlParts.host}${urlParts.pathname}`;
  const client = new MongoClient(url, opts);
  await client.connect();
  const db = client.db();
  return {db, admin: db.admin()};
}

function _checkServerVersion({serverInfo, config}) {
  // check that server version is supported
  const {version} = serverInfo;
  logger.info('connected to database', {
    url: urls.sanitize(config.url),
    version,
  });
  if(config.requirements.serverVersion &&
    !semver.satisfies(version, config.requirements.serverVersion)) {
    throw new BedrockError(
      'Unsupported database version.',
      'DatabaseError', {
        url: urls.sanitize(config.url),
        version,
        required: config.requirements.serverVersion
      });
  }
}
