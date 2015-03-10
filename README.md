# bedrock-mongodb

A [bedrock][] module that creates a simple MongoDB database and provides an
easy API for creating and working with its collections.

## Quick Examples

```
npm install bedrock-mongodb
```

Below is an example that simply opens a collection when the database is ready
and then runs a query and prints the result. A more common use case for a
module that uses `bedrock-mongodb` would be to expose its own API that hides
the details of using whatever collections it has opened.

```js
var bedrock = require('bedrock');
var database = require('bedrock-mongodb');

// custom configuration
config.mongodb.name = 'my_project_dev'; // default: bedrock_dev
config.mongodb.host = 'localhost';      // default: localhost
config.mongodb.port = 27017;            // default: 27017

// open a collection once the database is ready
bedrock.events.on('bedrock-mongodb.ready', function(callback) {
  database.openCollections(['collection1', 'collection2'], function(err) {
    if(err) {
      return callback(err);
    }
    // do something with the open collection
    database.collections.collection1.find({id: 'foo'}, function(err, result) {
      if(err) {
        return callback(err);
      }
      console.log('result', result);
      callback();
    });
  });
});

bedrock.start();
```

## Configuration

For documentation on database configuration, see [config.js](https://github.com/digitalbazaar/bedrock-mongodb/blob/master/lib/config.js).

## How It Works

## Setup

1. Ensure an admin user is set up on mongodb. To do so, follow the instructions
   at [mongodb.org](http://docs.mongodb.org/manual/tutorial/add-user-administrator/)
   for your version of MongoDB. Versions 2.4 and 2.6 are currently supported.
2. [optional] Tweak your project's configuration settings; see
   [Configuration](#configuration) or [Quick Examples](#quickexamples).


[bedrock]: https://github.com/digitalbazaar/bedrock
