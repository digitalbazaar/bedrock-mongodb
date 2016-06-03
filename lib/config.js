/*
 * Bedrock mongodb configuration.
 *
 * Copyright (c) 2012-2016 Digital Bazaar, Inc. All rights reserved.
 */
var config = require('bedrock').config;

config.mongodb = {};
// Note: `config.mongodb.url` is not set by default. When it is not set, it
// will be assembled from from the `config.mongodb.name`, `config.mongodb.host`,
// and `config.mongodb.port`. When it is set, those values, any authentication
// credentials, and any server options will be parsed from the URL and override
// the broken-down configuration options set here.
//
// If `config.mongodb.local.url` is not set, the connection URL for the local
// database will be assembled from `config.mongodb.local.name`,
// `config.mongodb.host` and `config.mongodb.port`.
//
// At a minimum, the URL must specify a host, port, and database name. It may
// omit a username and password if those are provided as
// `config.mongodb.username` and `config.mongodb.password`, otherwise those
// values will be removed from the URL to prevent their logging and a
// separate authentication call will be made after connecting.
//
// `mongodb.connectOptions` will override any specified in the URL.
//
// format: mongodb://[username:password@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]
//
//config.mongodb.url = 'mongodb://localhost:27017/bedrock_dev';
config.mongodb.name = 'bedrock_dev';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.username = 'bedrock';
config.mongodb.password = 'password';
config.mongodb.adminPrompt = true;
config.mongodb.authentication = {
  // used by MongoDB >= 3.0
  //authMechanism: 'SCRAM-SHA-1'
  // used by MongoDB < 3.0
  //authMechanism: 'MONGODB-CR'
};
config.mongodb.connectOptions = {
  db: {
    w: 'majority',
    journal: true
  },
  server: {
    auto_reconnect: true
  },
  replSet: {},
  mongos: {}
};
config.mongodb.writeOptions = {
  j: true,
  w: 'majority',
  multi: true
};
/* DEPRECATED */
config.mongodb.options = {
  w: 'majority',
  journal: true,
  j: true
};

// local database config
//
// The local database is an optimization for nodes that are able to store
// local state. It reduces the need to allocate global ids for each new
// process. If replica sets are used for the main database, the local
// database should be configured as a separate database instance on each
// node.
config.mongodb.local = {};
config.mongodb.local.enable = false;
//config.mongodb.local.url = 'mongodb://localhost:27017/local';
config.mongodb.local.name = 'local';
config.mongodb.local.collection = 'bedrock_dev';
config.mongodb.local.writeOptions = {
  w: 1,
  j: true,
  multi: true
};
