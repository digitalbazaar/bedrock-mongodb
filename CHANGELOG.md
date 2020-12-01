# bedrock-mongodb ChangeLog

## 8.1.0 - 2020-12-xx

### Added
- Support promises in public API calls `openCollections`
  an `createIndexes`.

## 8.0.4 - 2020-11-05

### Fixed
- Log sanitized `config.url`.

## 8.0.3 - 2020-11-05

### Fixed
- Use database sepecified in the connect string.

## 8.0.2 - 2020-10-20

### Fixed
- Replace deprecated collection.s.{name, namespace} with mongo 3.5 properties.

### Changed
- Add new debug mode to test project.

## 8.0.1 - 2020-09-25

### Fixed
- Make handling of binary fields consistent across Mongo APIs by setting
  `promoteBuffers: true` in the client `connectOptions`.

## 8.0.0 - 2020-09-23

### Changed
- **BREAKING**: Removed support for localCollections.
- _createUser now works with mongoDB node driver 3.5.
- Removed _addLocalUser (_createUser can now handle this).
- Removed local config options from `config.js`.
- Throw if the MongoDB serverVersion is less than 2.6.

### Added
- Prompt admin for `authSource` in the adminPrompt.

## 7.1.0 - 2020-06-23

### Changed
- Add a check to ensure connection errors are passed to the callback.

### Added
- Added an auth object to connectOptions if config.username & password are set.
- Added a `useNewUrlParser` option to config.

## 7.0.0 - 2020-06-05

### Changed
- **BREAKING**: Update to `mongodb` 3.5 node driver.
- **BREAKING**: Set default server version requirement to ">=4.2".
  - This requirement can be adjusted with the
    `config.mongodb.requirements.serverVersion` config value.
- GitHub actions now tests Node.js versions 10, 12, and 14.
- GitHub actions now tests mongodb version 4.2.
- **BREAKING** autoReconnect is now `false` and should not be `true`.
- `runOnceAsync` has been changed to `runOnce`.
- Db no longer contains methods that are Mongo 3.5 client specific.
- Client now refers to a Mongo 3.5 client with an updated API.
- Methods that now require `null` then callback have been set.
- GridFSBucket now takes a Mongo 3.5 Db instance.
- `insert` has been changed to `insertOne`.
- `isDatabaseError` looks for a variety of Mongo Errors now.
- `_openDatabase` returns an object with a client and a db.
- `localClient.close` has been replaced with `db.close`.
- Calls to login for authentication have been updated.
- `bedrock` peerDependency has been updated to `^3.1.1`.

### Addded
- `useUnifiedTopology` is now `true` and relevant settings have been added for
  it.
- `forceServerObjectId` is now set and is `true` by default.
- Tests for `openCollection`.
- Tests for `createIndex`.
- Tests for `collections`.
- `test.config.js` now uses `forceAuthentication` with a username and password.

### Removed
- **BREAKING**: `lib/migrations.js` has been removed.
- **BREAKING**: `lib/idGenerator.js` has been removed.

## 6.0.2 - 2019-11-08

### Changed
- Update max bedrock dependency to 3.x.

## 6.0.1 - 2019-11-08

### Changed
- Update to latest bedrock events API.
- Update to latest bedrock runOnce API.
  - Using deprecated runOnceAsync for bedrock@1 compatibility.

## 6.0.0 - 2019-09-03

### Changed
- **BREAKING**: The `hash` API now uses Node crypto's SHA256 implementation.
  This eliminates the `sodium-native` native dependency. Developers should
  use the v6 release on new projects or projects with no persistent data.
  Hashes on existing data generated with v5 are not compatible and there is no
  upgrade mechanism.

## 5.5.0 - 2018-11-28

### Changed
- Replace unmaintained `chloride` module with `sodium-native`.

## 5.4.0 - 2018-08-29
- Rollback callbackify createIndexes due to incompatibilities with
  `async.waterfall`.

## 5.3.0 - 2018-08-29
- callbackify createIndexes API and add validation on options parameter.

## 5.2.0 - 2018-07-05

### Added
- Add `createGridFSBucket` API.

## 5.1.2 - 2018-03-02

### Fixed
- Handle duplicate distributed ID keys on init.

## 5.1.1 - 2018-02-27

### Changed
- Use `chloride` to provide blake2b implementation; it is a faster
  and better maintained implementation.

## 5.1.0 - 2018-02-24

### Added
- Ability to check the server version via the semver-style version string
  located in the `bedrock.config.mongodb.requirements.serverVersion` config
  key.

## 5.0.1 - 2018-02-24

### Fixed
- Fix release tag.

## 5.0.0 - 2018-02-24

### Changed
- **BREAKING**: Use 256-bit `blake2b` for `database.hash`.

## 4.0.3 - 2018-01-26

### Fixed
- Fix calls to `logger.debug`.

## 4.0.2 - 2017-10-27

### Fixed
- Remove erroneous passing of write options to collection creation.

## 4.0.1 - 2017-10-27

### Fixed
- Fix index key pattern (use `1` not `true`).

## 4.0.0 - 2017-10-24

### Changed
- Update Mongo DB driver to v2.2.x.
- Use ES6 syntax.
- Update `async` dependency to v2.x.

## 3.2.3 - 2016-12-29

### Fixed
- Fix bug when checking config.mongodb.local.

## 3.2.2 - 2016-11-07

### Changed
- Replace deprecated MongoDB API `ensureIndex` with `createIndex`.

## 3.2.1 - 2016-10-05

### Fixed
- Skip more initialization when !config.local.enable.

### Added
- Additional logging and error wrappers.

## 3.2.0 - 2016-09-12

### Added
- Auto-detection for mongoDB authentication and an override config flag.

## 3.1.0 - 2016-09-01

### Added
- Add \_migration API which can be used for document transformation.

## 3.0.3 - 2016-06-16

### Fixed
- Ignore collection not found error when dropping collections.

## 3.0.2 - 2016-06-13

### Fixed
- Recursively encode array elements when building a database update.

## 3.0.1 - 2016-06-09

### Changed
- Init errors now wrapped in a BedrockError.
- Handle new MongoDB driver db.authenticate errors. No longer returns an error
  code so also check for an error "message" field of "could not authenticate".

## 3.0.0 - 2016-06-07

### Changed
- Add `config.mongodb.local.enable` option to enable using a local database.
  Disabled by default. In a remote replicated database setup, the local
  database needs to actually be local. Running a full mongodb node is
  heavyweight for the purposes of this module. For the time being, if the local
  database is disabled, every startup of a process will get a new globalId.  A
  future update will introduce a more lightweight localId storage option.
- Update mongodb driver dependency.

## 2.1.4 - 2016-05-23

### Fixed
- Ensure I/O events can be processed when waiting for ID
  components in ID generator to load.

## 2.1.3 - 2016-05-20

### Fixed
- Ensure database is set when using a mongodb URL.

## 2.1.2 - 2016-05-04

### Fixed
- Set proper defaults when parsing mongodb URL.

## 2.1.1 - 2016-05-02

### Fixed
- Fix configuration typo.

## 2.1.0 - 2016-04-29

### Added
- Add feature to allow mongodb `url` in configuration.

### Changed
- Deprecate `mongodb.options`.
- Replace deprecated `safe` mongodb option with `w: 'majority'`.
- Support only node >= 4.x.x.

## 2.0.1 - 2016-03-15

### Changed
- Update bedrock dependencies.

## 2.0.0 - 2016-03-02

### Changed
- Update deps for npm v3 compatibility.

## 1.1.0 - 2016-02-05

### Added
- Support MongoDB >= 3.0.
- Add authentication config option.

### Changed
- Removed support for MongoDB 2.4 from the README, but no technical change
  prohibits its use.

## 1.0.2 - 2015-07-01

### Changed
- Do not use deprecated native BSON parser by default.

## 1.0.1 - 2015-05-07

## 1.0.0 - 2015-04-08

## 0.1.1 - 2015-03-06

### Fixed
- Fix duplicate key error when adding users to the local collection in
  MongoDB 2.4.

## 0.1.0 - 2015-02-23

- See git history for changes.
