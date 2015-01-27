/*
 * Bedrock mongodb configuration.
 *
 * Copyright (c) 2012-2015 Digital Bazaar, Inc. All rights reserved.
 */
var config = require('bedrock').config;

config.mongodb = {};
config.mongodb.name = 'bedrock_dev';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.username = 'bedrock';
config.mongodb.password = 'password';
config.mongodb.adminPrompt = true;
config.mongodb.options = {
  safe: true,
  j: true,
  native_parser: true
};
config.mongodb.connectOptions = {
  auto_reconnect: true,
  socketOptions: {
    maxBsonSize: 1024 * 1024 * 16
  }
};
config.mongodb.writeOptions = {
  safe: true,
  j: true,
  // FIXME: change to 2 for at least 1 replica
  w: 1,
  multi: true
};

// local database config
config.mongodb.local = {};
config.mongodb.local.name = 'local';
config.mongodb.local.collection = 'bedrock_dev';
config.mongodb.local.writeOptions = {
  safe: true,
  j: true,
  multi: true
};

// TODO: remove deprecated
config.database = config.mongodb;
