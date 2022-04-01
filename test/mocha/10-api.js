/*!
 * Copyright (c) 2017-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as database from '@bedrock/mongodb';

describe('api', function() {
  describe('openCollection', function() {
    it('should open a collection', async function() {
      let error = null;
      try {
        await database.openCollections(['test']);
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
    });
    it('should open several collections', async function() {
      let error = null;
      try {
        await database.openCollections(['test', 'test1', 'test2', 'test3']);
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
      should.exist(database.collections);
      database.collections.should.have.property('test');
      database.collections.should.have.property('test1');
      database.collections.should.have.property('test2');
      database.collections.should.have.property('test3');
    });
  });
  describe('hash', function() {
    it('should hash a key', async function() {
      let error;
      let result;
      try {
        result = database.hash('1245678');
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
      should.exist(result);
      result.should.be.a('string');
    });
    it('should throw InvalidKey error if key is not a string',
      async function() {
        let error;
        let result;
        try {
          result = database.hash({});
        } catch(e) {
          error = e;
        }
        should.not.exist(result);
        should.exist(error);
        error.name.should.equal('InvalidKey');
      });
  });
  describe('buildUpdate', function() {
    const user = {
      id: '1234',
      name: 'user',
      type: 'standard'
    };
    it('should build an update object',
      async function() {
        let error;
        let result;
        try {
          result = database.buildUpdate(user);
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql(user);
      });
    it('should build an update object that includes an array and uses a field',
      async function() {
        let error;
        let result;
        try {
          result = database.buildUpdate({
            id: '1234',
            names: ['name1', 'name2']
          }, 'user');
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({
          'user.id': '1234',
          'user.names': ['name1', 'name2']
        });
      });
    it('should build an update object using a field',
      async function() {
        let error;
        let result;
        try {
          result = database.buildUpdate(user, 'user');
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({
          'user.id': '1234',
          'user.name': 'user',
          'user.type': 'standard'
        });
      });
    it('should build an update object using a field and filter option',
      async function() {
        let error;
        let result;
        const filter = function(obj) {
          // filters out user.id
          if(obj !== 'user.id') {
            return obj;
          }
          return;
        };
        try {
          result = database.buildUpdate(
            user, 'user', {filter});
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({
          'user.name': 'user',
          'user.type': 'standard'
        });
      });
    it('should build an update object using an exclude option',
      async function() {
        let error;
        let result;
        try {
          result = database.buildUpdate(user, {exclude: ['id']});
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({
          name: 'user',
          type: 'standard'
        });
      });
    it('should build an update object using a field and include option',
      async function() {
        let error;
        let result;
        try {
          result = database.buildUpdate(
            user, 'user', {include: ['user.id']});
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({
          'user.id': '1234'
        });
      });
    it('should throw a TypeError if filter is not a function',
      async function() {
        let error;
        let result;
        const filter = 'string';
        try {
          result = database.buildUpdate(
            user, 'user', {filter});
        } catch(e) {
          error = e;
        }
        should.not.exist(result);
        should.exist(error);
        error.name.should.equal('TypeError');
      });
    it('should throw an Error if filter is provide with include or ' +
      'exclude.', async function() {
      let error;
      let result;
      const filter = function(obj) {
        // filters out user.id
        if(obj !== 'user.id') {
          return obj;
        }
        return;
      };
      try {
        result = database.buildUpdate(
          user, 'user', {filter, exclude: ['id']});
      } catch(e) {
        error = e;
      }
      should.not.exist(result);
      should.exist(error);
      error.name.should.equal('Error');
    });
  });
  describe('createIndexes', function() {
    it('should create an index', async function() {
      let error = null;
      try {
        await database.openCollections(['test']);
        await database.createIndexes([{
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
  describe('createGridFSBucket', function() {
    it('should create a streaming GridFS bucket instance', async function() {
      let error;
      let result;
      try {
        const bucketName = 'test';
        result = await database.createGridFSBucket({
          bucketName
        });
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
      should.exist(result);
      result.should.be.a('object');
      result.s.options.bucketName.should.equal('test');
    });
  });
  describe('encodeString', function() {
    it('should encode a string with illegal mongodb key characters',
      async function() {
        let error;
        let result;
        try {
          result = database.encodeString(
            'test$string.with%illegal.characters');
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('string');
        result.should.equal('test%24string%2Ewith%25illegal%2Echaracters');
      });
  });
  describe('encode', function() {
    it('should encode an object',
      async function() {
        let error;
        let result;
        try {
          result = database.encode({
            'test.name': 'name'
          });
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({'test%2Ename': 'name'});
      });
    it('should encode an array',
      async function() {
        let error;
        let result;
        try {
          result = database.encode([{
            'test.id': '1234',
            'test.name': 'name'
          }]);
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('array');
        result.should.eql([{
          'test%2Eid': '1234',
          'test%2Ename': 'name'
        }]);
      });
    it('should return original value if not object or array',
      async function() {
        let error;
        let result;
        try {
          result = database.encode('test');
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('string');
        result.should.eql('test');
      });
  });
  describe('decodeString', function() {
    it('should decode a string that was previsouly encoded',
      async function() {
        let error;
        let result;
        try {
          result = database.decodeString(
            'test%24string%2Ewith%25illegal%2Echaracters');
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('string');
        result.should.equal('test$string.with%illegal.characters');
      });
  });
  describe('decode', function() {
    it('should encode an object',
      async function() {
        let error;
        let result;
        try {
          result = database.decode({'test%2Ename': 'name'});
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('object');
        result.should.eql({'test.name': 'name'});
      });
    it('should encode an array',
      async function() {
        let error;
        let result;
        try {
          result = database.decode([{
            'test%2Eid': '1234',
            'test%2Ename': 'name'
          }]);
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('array');
        result.should.eql([{
          'test.id': '1234',
          'test.name': 'name'
        }]);
      });
    it('should return original value if not object or array',
      async function() {
        let error;
        let result;
        try {
          result = database.decode('test');
        } catch(e) {
          error = e;
        }
        should.not.exist(error);
        should.exist(result);
        result.should.be.a('string');
        result.should.eql('test');
      });
  });
  describe('collections', function() {
    before(async function() {
      await database.openCollections(['test']);
      await database.createIndexes([{
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
      let error;
      let result = null;
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
      let error;
      let result = null;
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
      let error;
      let result = null;
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
