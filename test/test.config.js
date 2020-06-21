/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

// MongoDB
config.mongodb.name = 'test-connectOptions';
config.mongodb.host = process.env.mongo_host;
config.mongodb.port = process.env.mongo_port;
config.mongodb.connectOptions.replicaSet = process.env.mongo_replica;
config.mongodb.connectOptions.ssl = true;
config.mongodb.connectOptions.auth = {
  user: process.env.mongo_username,
  password: process.env.mongo_password
};
config.mongodb.connectOptions.authSource = 'admin';
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
console.log('mongo config', config.mongodb);
