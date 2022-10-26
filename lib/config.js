/*!
 * Copyright (c) 2012-2012 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

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
config.mongodb.protocol = 'mongodb';
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
// this is used when making connections to the database
config.mongodb.connectOptions = {
  serverSelectionTimeoutMS: 30000,
  // promotes binary BSON values to native Node.js buffers
  promoteBuffers: true,
  forceServerObjectId: true,
  // it is recommended to set either ssl or tls to true in production
  // ssl: true
  // tls: true
  // authSource is the database you authenticate against
  // it often needs to be set explicitly
  // authSource: 'admin'
};

// this is used when writing to the database
config.mongodb.writeOptions = {
  writeConcern: {
    w: 'majority',
    j: true,
  },
};

config.mongodb.requirements = {};
// server version requirement with server-style string
config.mongodb.requirements.serverVersion = '>=4.4';

// this is used by _createUser to add a user as an admin to a collection
// config.mongodb.collection = 'admin-collection';
