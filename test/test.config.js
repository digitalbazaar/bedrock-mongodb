/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const path = require('path');

// MongoDB
config.mongodb.name = 'bedrock_mongodb_test';
config.mongodb.username = 'root';
config.mongodb.password = 'root';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
/**
config.mongodb.authentication = {
  authMechanism: 'SCRAM-SHA-1'
};
*/
config.mongodb.forceAuthentication = true;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
