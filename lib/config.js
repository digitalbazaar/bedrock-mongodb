/*
 * Bedrock mongodb configuration.
 *
 * Copyright (c) 2012-2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const config = require('bedrock').config;

config.mongodb = {};
// Note: `config.mongodb.url` is not set by default. When it is not set, it
// will be assembled from from the `config.mongodb.name`, `config.mongodb.host`,
// and `config.mongodb.port`. When it is set, those values, any authentication
// credentials, and any server options will be parsed from the URL and override
// the broken-down configuration options set here.
//
// At a minimum, the URL must specify a host, port, and database name. It may
// omit a username and password if those are provided as
// `config.mongodb.username` and `config.mongodb.password`, otherwise those
// values will be removed from the URL to prevent their logging and a
// separate authentication call will be made after connecting.
//
// `mongodb.connectOptions` will override any specified in the URL.
//
// format: mongodb://[username:password@]host1[:port1][,host2[:port2],
// ...[,hostN[:portN]]][/[database][?options]]
//
// config.mongodb.url = 'mongodb://localhost:27017/bedrock_dev';
config.mongodb.name = 'bedrock_dev';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.username = undefined;
config.mongodb.password = undefined;
config.mongodb.adminPrompt = true;
// always authenticate to mongodb even when auth is not required by mongodb
config.mongodb.forceAuthentication = false;
config.mongodb.authentication = {
  // used by MongoDB >= 3.0
  // authMechanism: 'SCRAM-SHA-1'
  // used by MongoDB < 3.0
  // authMechanism: 'MONGODB-CR'
};
config.mongodb.connectOptions = {
  w: 'majority',
  j: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  autoReconnect: false,
  useNewUrlParser: true,
  // the db to authenticate against
  authSource: undefined
};
config.mongodb.writeOptions = {
  j: true,
  w: 'majority',
  // as mongo 4.2 this is no longer used by updateOne or updateMany
  // FIXME remove this once all dependencies have been upgraded
  multi: true,
  // this is used by insert methods
  forceServerObjectId: true,
};
/* DEPRECATED */
config.mongodb.options = {
  w: 'majority',
  journal: true,
  j: true
};

config.mongodb.requirements = {};
// server version requirement with server-style string
config.mongodb.requirements.serverVersion = '>=4.2';

// this is used by _createUser to add a user as an admin
//config.mongodb.collection = 'admin-collection';
