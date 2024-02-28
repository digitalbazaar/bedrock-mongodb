/*!
 * Copyright 2012 - 2024 Digital Bazaar, Inc.
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
