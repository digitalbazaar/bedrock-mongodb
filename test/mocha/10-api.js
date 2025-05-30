/*!
 * Copyright 2017 - 2025 Digital Bazaar, Inc.
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
    it('should throw TypeError error if key is not a string',
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
        error.name.should.equal('TypeError');
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
          options: {unique: true}
        }]);
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
    });
    it('should throw DuplicateError on duplicate index', async function() {
      let error = null;
      try {
        await database.openCollections(['test']);
        await database.createIndexes([{
          collection: 'test',
          fields: {id: 1},
          options: {unique: true, background: false}
        }]);
        const record = {
          id: database.hash('insert-duplicate')
        };
        await database.collections.test.insertOne(record);
        await database.collections.test.insertOne(record);
      } catch(e) {
        error = e;
      }
      should.exist(error);
      const assertDbError = database.isDatabaseError(error);
      assertDbError.should.equal(
        true,
        'Expected duplicate error to be a database error');
      const assertDuplicateError = database.isDuplicateError(error);
      assertDuplicateError.should.equal(
        true,
        'Expected "isDuplicateError()" to be true');
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
        options: {unique: true}
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
      result.should.have.keys(['acknowledged', 'insertedId']);
    });
    it('should properly promote binary values to buffers', async function() {
      let error;
      let result = null;
      const recordId = '06f336c0-7177-401b-a8ce-9a2e36331b8e';
      try {
        const record = {
          id: recordId,
          aBinaryField: Buffer.from(recordId)
        };
        await database.collections.test.insertOne(record);
        result = await database.collections.test.findOne({id: recordId});
      } catch(e) {
        error = e;
      }
      should.not.exist(error);
      should.exist(result);
      result.aBinaryField.should.be.instanceof(Buffer);
      result.aBinaryField.toString().should.equal(recordId);
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
  describe('isDuplicateError() helper', () => {
    it('should properly detect a duplicate error', async function() {
      await database.openCollections(['test']);
      await database.createIndexes([{
        collection: 'test',
        fields: {id: 1},
        options: {unique: true}
      }]);
      const record = {
        id: 'f466586f-7006-474d-ae44-d16c96a7b5c3'
      };
      await database.collections.test.insertOne(record);

      let error = null;
      try {
        await database.collections.test.insertOne(record);
      } catch(e) {
        error = e;
      }
      should.exist(error);
      database.isDuplicateError(error).should.be.true;
    });
  });
});
