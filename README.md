# bedrock-mongodb

A [bedrock][] module that creates a simple MongoDB database and provides an
easy API for creating and working with its collections.

## Requirements

- npm v3+

## Quick Examples

```
npm install bedrock-mongodb
```

Below is an example that simply opens a collection when the database is ready
and then runs a query and prints the result. A more common use case for a
module that uses `bedrock-mongodb` would be to expose its own API that hides
the details of using whatever collections it has opened.

```js
import * as bedrock from 'bedrock';
import * as database from 'bedrock-mongodb';

// custom configuration
bedrock.config.mongodb.name = 'my_project_dev'; // default: bedrock_dev
bedrock.config.mongodb.host = 'localhost';      // default: localhost
bedrock.config.mongodb.port = 27017;            // default: 27017
bedrock.config.mongodb.username = 'my_project'; // default: bedrock
bedrock.config.mongodb.password = 'password';   // default: password

// the mongodb database 'my_project_dev' and the 'my_project' user will
// be created on start up following a prompt for the admin user credentials

// alternatively, use `mongodb` URL format:
bedrock.config.mongodb.url = 'mongodb://localhost:27017/my_project_dev';

// enable local collection if a local database is available
// the local database has similar options to primary database
// see lib/config.js for details
// bedrock.config.mongodb.local.enable = true; // default: false

// open some collections once the database is ready
bedrock.events.on('bedrock-mongodb.ready', async function() {
  await database.openCollections(['collection1', 'collection2']);

  // do something with the open collection(s)
  const result = await database.collections.collection1.findOne({id: 'foo'});
  console.log('result', result);
});

bedrock.start();
```

## Configuration

For documentation on database configuration, see [config.js](./lib/config.js).

### Connecting and Authenticating
MongoDB's documentation offers tons of great examples on how to authenticate
using a myriad number of connection strings.

[Mongo Node 3.5 Driver connect docs](http://mongodb.github.io/node-mongodb-native/3.5/tutorials/connect/)

[Mongo Node 3.5 Driver atlas docs](https://docs.mongodb.com/drivers/node#connect-to-mongodb-atlas)

You can also connect to access-enabled mongo servers using some small changes to the
`config.mongodb.connectOptions`:
```js
import {config} from 'bedrock';
config.mongodb.username = 'me';
config.mongodb.password = 'password';
const {connectOptions} = config.mongodb;
// optional, only required if connecting to a replicaSet
connectOptions.replicaSet = 'my_provider_replica_set';
// optional, but required in production by many providers
connectOptions.ssl = true;
// optional, only required if your provider requires tls
connectOptions.tls = true;
// the `authSource` option replaces the older `authDB` option
// it should be specified or else it will be the `mongodb.name`
connectOptions.authSource = 'my_provider_auth_db';
```
MongoDB provides [excellent docs on their connection strings](https://docs.mongodb.com/manual/reference/connection-string/)

You can connect using a url by setting:
```js
config.mongodb.url = 'mongodb://myDBReader:D1fficultP%40ssw0rd@mongodb0.example.com:27017/?authSource=admin';
```

## Requirements

* Linux or Mac OS X (also works on Windows with some coaxing)
* node.js >= 14.x
* npm >= 6.x
* mongodb ~= 4.x
* libkrb5-dev >= 1.x.x

## Setup

1. Ensure an admin user is set up on mongodb. To do so, follow the instructions
   at [mongodb.org](http://docs.mongodb.org/manual/tutorial/add-user-administrator/)
   for your version of MongoDB. Version 4.2.x is currently supported.
2. [optional] Tweak your project's configuration settings; see
   [Configuration](#configuration) or [Quick Examples](#quickexamples).

## API

### collections

An object whose keys are the names of the collections that have been
opened via `openCollections`.

### openCollections(collections)

Opens a set of collections (creating them if necessary), if they aren't already
open. Once all of the collections are open the returned promise resolves. If
an error occurs, the returned promise rejects. If no error occurs, then once
the promise resolves, the `collections` object will have keys that match the
collection names and values that are instances of
[mongodb-native][]
[Collection](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html).

### createGridFSBucket(options)

Creates and returns a new `GridFSBucket` from the native driver. Options are
the same as for `GridFSBucket`. The current client is used and the
`writeConcern` option defaults to the `writeOptions` config value.

## Test Mode
### Drop Collections on Initialization
When doing testing, it is often desirable to have empty collections at the
beginning of test operations.  This may be accomplished by the following
configuration parameters **IN ADDITION** to specifying the test parameter on
the command line.  The test configuration in a project should **ALWAYS**
specify a **UNIQUE** mongodb database.
```
// Always specify a unique mongodb database for testing
bedrock.config.mongodb.name = 'my_project_test';
bedrock.config.mongodb.host = 'localhost';
bedrock.config.mongodb.port = 27017;
bedrock.config.mongodb.username = 'test'; // default: bedrock
bedrock.config.mongodb.password = 'password';
// drop collections on initialization
bedrock.config.mongodb.dropCollections.onInit = true;
// if 'onInit' is specified, 'collections' must also be specified
// if collections is an empty array, ALL collections will be dropped
bedrock.config.mongodb.dropCollections.collections = [];
```

[bedrock]: https://github.com/digitalbazaar/bedrock
[mongodb-native]: http://mongodb.github.io/node-mongodb-native/3.5/
