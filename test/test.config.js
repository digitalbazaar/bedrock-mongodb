/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

// MongoDB
config.mongodb.name = 'test-connectOptions';
config.mongodb.host = process.env.mongo_host || 'localhost';
config.mongodb.port = process.env.mongo_port || 27017;
config.mongodb.connectOptions.replicaSet = process.env.mongo_replica;
if(process.env.mongo_username && process.env.mongo_password) {
  const {connectOptions} = config.mongodb;
  connectOptions.ssl = true;
  connectOptions.auth = {
    user: process.env.mongo_username || 'admin',
    password: process.env.mongo_password || 'admin'
  };
  connectOptions.authSource = process.env.mongo_authdb;
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
