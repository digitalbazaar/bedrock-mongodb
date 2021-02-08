/*
 * Bedrock mongodb test configuration.
 *
 * Copyright (c) 2012-2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const config = require('bedrock').config;

config.mongodb.name = 'bedrock_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.adminPrompt = true;

config.mongodb.writeOptions = {
  safe: true,
  writeConcern: {
    j: true,
    w: 1
  },
  multi: true
};

// these settings are only effective if `test` is specified on the command line
// when onInit = true, collections are dropped on initialization
config.mongodb.dropCollections = {};
config.mongodb.dropCollections.onInit = false;
// specify collections to drop.  empty array = all
config.mongodb.dropCollections.collections = [];
