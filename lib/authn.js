/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as urls from './urls.js';
import {logger} from './logger.js';
import mongo from 'mongodb';

const {MongoClient} = mongo;

export async function openDatabase(options) {
  const config = bedrock.config.mongodb;
  // copy the config stuff related to connecting
  const opts = {
    database: config.name,
    authentication: {...config.authentication},
    // authSource should be set in connectOptions
    connectOptions: {...config.connectOptions},
    writeOptions: {...config.writeOptions},
    ...options
  };

  // if a username is defined create an auth object for Mongo;
  // otherwise `auth` will be passed as `null` and success will rely on other
  // config options such as the url for the server
  if(config.username) {
    opts.connectOptions.auth = {
      user: config.username,
      password: config.password
    };
    // authSource is the database to authenticate against
    // this is usually `admin` in dev and a specific db in production
    opts.connectOptions.authSource =
      config.connectOptions.authSource || options.name;
  }

  // if the user specified a connection URL use it
  if(!opts.url) {
    opts.url = urls.create(config);
  }

  // connect to database and get server info
  const connectResult = await _connect(opts);

  return connectResult;
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
  const db = client.db(options.database);
  const ping = await db.admin().ping();
  logger.debug(
    'database connection succeeded: db=' + options.database +
    ' username=' + connectOptions?.auth?.user, {ping});
  return {client, db};
}
