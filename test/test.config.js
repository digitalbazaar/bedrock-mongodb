/*!
 * Copyright 2019 - 2024 Digital Bazaar, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {config} from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const convertToBoolean = (envVariable = '') => /^(1|true)$/i.test(envVariable);
const assertNull = envVariable => /^null$/i.test(envVariable);

const {connectOptions} = config.mongodb;

// MongoDB
config.mongodb.name = 'bedrock_mongodb_test';
config.mongodb.host = process.env.MONGODB_HOST || 'localhost';
if(process.env.MONGODB_PORT) {
  config.mongodb.port = assertNull(process.env.MONGODB_PORT) ?
    null : process.env.MONGODB_PORT;
}
if(process.env.MONGODB_PROTOCOL) {
  config.mongodb.protocol = process.env.MONGODB_PROTOCOL;
}
// set the env variable to 1 or true to make these true
// set the env variable to anything else to make them false
if(process.env.MONGODB_SSL) {
  connectOptions.ssl = convertToBoolean(process.env.MONGODB_SSL);
}
if(process.env.MONGODB_TLS) {
  connectOptions.tls = convertToBoolean(process.env.MONGODB_TLS);
}
if(process.env.MONGODB_AUTHSOURCE) {
  connectOptions.authSource = process.env.MONGODB_AUTHSOURCE;
}
if(process.env.MONGODB_URL) {
  // used for testing url only connections
  config.mongodb.url = process.env.MONGODB_URL;
}
if(process.env.MONGODB_REPLICASET) {
  // this can safely be undefined
  connectOptions.replicaSet = process.env.MONGODB_REPLICASET;
}
if(process.env.MONGODB_USERNAME) {
  config.mongodb.username = process.env.MONGODB_USERNAME;
}
if(process.env.MONGODB_PASSWORD) {
  config.mongodb.password = process.env.MONGODB_PASSWORD;
}

//config.mongodb.connectOptions.loggerLevel = 'debug';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
config.mongodb.forceAuthentication = false;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
