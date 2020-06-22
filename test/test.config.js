/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

// MongoDB
config.mongodb.name = 'test-connectOptions';
config.mongodb.host = process.env.MONGODB_HOST || 'localhost';
config.mongodb.port = process.env.MONGODB_PORT || 27017;
config.mongodb.connectOptions.replicaSet = process.env.MONGODB_REPLICASET;
if(process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
  const {connectOptions} = config.mongodb;
  connectOptions.ssl = true;
  connectOptions.auth = {
    user: process.env.MONGODB_USERNAME || 'admin',
    password: process.env.MONGODB_PASSWORD || 'admin'
  };
  connectOptions.authSource = process.env.MONGODB_AUTHSOURCE || 'admin';
}
//config.mongodb.connectOptions.loggerLevel = 'debug';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
/**
config.mongodb.authentication = {
  authMechanism: 'SCRAM-SHA-1'
};
*/
config.mongodb.forceAuthentication = true;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
