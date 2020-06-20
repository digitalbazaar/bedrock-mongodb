/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

// MongoDB
config.mongodb.name = 'bedrock_mongodb_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.username = 'test';
config.mongodb.password = 'test';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
/**
config.mongodb.authentication = {
  authMechanism: 'SCRAM-SHA-1'
};
*/
config.mongodb.forceAuthentication = true;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
