/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const convertToBoolean = (envVariable = '') => {
  if(/^(1|true)$/.test(envVariable)) {
    return true;
  }
  return false;
};

const {connectOptions} = config.mongodb;

// MongoDB
config.mongodb.name = 'bedrock_mongodb_test';
config.mongodb.host = process.env.MONGODB_HOST || 'localhost';
config.mongodb.port = process.env.MONGODB_PORT || 27017;
// set the env variable to 1 or true to make these true
// set the env variable to anything else to make them false
if(process.env.MONGODB_CHECK_SERVER_DETAILS) {
  config.mongodb.checkServerDetails =
    convertToBoolean(process.env.MONGODB_CHECK_SERVER_DETAILS);
}
if(process.env.MONGODB_SSL) {
  connectOptions.ssl = convertToBoolean(process.env.MONGODB_SSL);
}
// used for testing url only connections
config.mongodb.url = process.env.MONGODB_URL;
// this can safely be undefined
connectOptions.replicaSet = process.env.MONGODB_REPLICASET;

config.mongodb.username = process.env.MONGODB_USERNAME;
config.mongodb.password = process.env.MONGODB_PASSWORD;
if(process.env.MONGODB_AUTHSOURCE) {
  connectOptions.authSource = process.env.MONGODB_AUTHSOURCE;
}

//config.mongodb.connectOptions.loggerLevel = 'debug';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
config.mongodb.forceAuthentication = false;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
