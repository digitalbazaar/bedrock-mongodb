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
  describe('collections', function() {
    before(async function() {
      await promisify(database.openCollections)(['test']);
      await promisify(database.createIndexes)([{
        collection: 'test',
        fields: {id: 1},
        options: {unique: true, background: false}
      }]);
    });
    it('should have collections', async function() {
      should.exist(database.collections);
      database.collections.should.have.property('test');
    });
    it('should insertOne into a collection', async function() {
      let error, result = null;
      try {
        const record = {
          id: database.hash('insert-one')
        };
        result = await database.collections.test.insertOne(record);
      } catch(e) {
        error = e;
      }
      should.exist(result);
      should.not.exist(error);
    });
    it('should insertMany into a collection', async function() {
      let error;
      try {
        const one = {id: database.hash('insert-many-1')};
        const two = {id: database.hash('insert-many-2')};
        await database.collections.test.insertMany([one, two]);
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
    });
    it('should findOne in a collection', async function() {
      let error, result = null;
      const record = {
        id: database.hash('find-one')
      };
      try {
        await database.collections.test.insertOne(record);
        result = await database.collections.test.findOne(
          {id: record.id}, {projection: {_id: 0, id: 1}});
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
      should.exist(result);
      result.should.be.an('object');
      result.id.should.equal(record.id);
      // ensure we only get properties specified in the projection back
      Object.keys(result).should.deep.equal(['id']);
    });
    it('should find many records in a collection', async function() {
      let error, result = null;
      const one = {id: database.hash('find-many-1'), many: true};
      const two = {id: database.hash('find-many-2'), many: true};
      try {
        await database.collections.test.insertMany([one, two]);
        result = await database.collections.test.find({many: true}).toArray();
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
      should.exist(result);
      result.should.be.an('array');
      result.length.should.equal(2);
    });
  });
});
