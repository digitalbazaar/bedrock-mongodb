/*
 * Copyright (c) 2019-2020 Digital Bazaar, Inc. All rights reserved.
 */
const bedrock = require('bedrock');
require('bedrock-mongodb');

require('bedrock-test');
bedrock.start().catch(err => console.error(err));
