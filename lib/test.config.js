/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from 'bedrock';

config.mongodb.name = 'bedrock_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
config.mongodb.adminPrompt = true;

// these settings are only effective if `test` is specified on the command line
// when onInit = true, collections are dropped on initialization
config.mongodb.dropCollections = {};
config.mongodb.dropCollections.onInit = false;
// specify collections to drop.  empty array = all
config.mongodb.dropCollections.collections = [];
