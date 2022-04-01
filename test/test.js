/*!
 * Copyright (c) 2019-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import '@bedrock/mongodb';
import '@bedrock/test';

/*try {
  await import('/work/src/bedrock-dev/bedrock-mongodb/test/mocha/10-api.js');
} catch(e) {
  console.log('e', e);
}

try {
  await import('file:///work/src/bedrock-dev/bedrock-mongodb/test/mocha/10-api.js');
} catch(e) {
  console.log('e', e);
}*/

bedrock.start().catch(err => console.error(err));
