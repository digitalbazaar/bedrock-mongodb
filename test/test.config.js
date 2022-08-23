/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MongoDB
config.mongodb.name = 'bedrock_mongodb_test';
config.mongodb.host = process.env.MONGODB_HOST || 'localhost';
config.mongodb.port = process.env.MONGODB_PORT || 27017;
// set the env variable to 1 or make these true
// don't set the env variable for false
config.mongodb.checkServerDetails =
  Boolean(process.env.MONGODB_SKIPCHECKS) || true;
config.mongodb.connectOptions.ssl = Boolean(process.env.MONGODB_SSL) || false;
// used for testing url only connections
config.mongodb.url = process.env.MONGODB_URL;
// this can safely be undefined
config.mongodb.connectOptions.replicaSet = process.env.MONGODB_REPLICASET;

if(process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
  config.mongodb.username = process.env.MONGODB_USERNAME;
  config.mongodb.password = process.env.MONGODB_PASSWORD;
  const {connectOptions} = config.mongodb;
  connectOptions.authSource = process.env.MONGODB_AUTHSOURCE || 'admin';
  console.log(
    'TESTING WITH AUTH ', {
      username: config.mongodb.username,
      authSource: connectOptions.authSource,
      password: Boolean(config.mongodb.password),
      ssl: connectOptions.ssl,
      replicaSet: connectOptions.replicaSet
    });
}
//config.mongodb.connectOptions.loggerLevel = 'debug';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
config.mongodb.forceAuthentication = false;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
