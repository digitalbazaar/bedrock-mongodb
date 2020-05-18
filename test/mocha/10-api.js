const {promisify} = require('util');
const database = require('bedrock-mongodb');

describe('api', function() {
  describe('openCollection', function() {
    it('should open a collection', async function() {
      let error = null;
      try {
        await promisify(database.openCollections)(['test']);
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
    });
  });
  describe('createIndex', function() {
    it('should create an index', async function() {
      let error = null;
      try {
        await promisify(database.openCollections)(['test']);
        await promisify(database.createIndexes)([{
          collection: 'test',
          fields: {id: 1},
          options: {unique: true, background: false}
        }]);
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
    });
  });
});
