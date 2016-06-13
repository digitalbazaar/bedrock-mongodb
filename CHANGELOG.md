# bedrock-mongodb ChangeLog

## Unreleased

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
