# bedrock-mongodb ChangeLog

## [Unreleased]

## [2.1.2] - 2016-05-04

### Fixed
- Set proper defaults when parsing mongodb URL.

## [2.1.1] - 2016-05-02

### Fixed
- Fix configuration typo.

## [2.1.0] - 2016-04-29

### Added
- Add feature to allow mongodb `url` in configuration.

### Changed
- Deprecate `mongodb.options`.
- Replace deprecated `safe` mongodb option with `w: 'majority'`.
- Support only node >= 4.x.x.

## [2.0.1] - 2016-03-15

### Changed
- Update bedrock dependencies.

## [2.0.0] - 2016-03-02

### Changed
- Update deps for npm v3 compatibility.

## [1.1.0] - 2016-02-05

### Added
- Support MongoDB >= 3.0.
- Add authentication config option.

### Changed
- Removed support for MongoDB 2.4 from the README, but no technical change
  prohibits its use.

## [1.0.2] - 2015-07-01

### Changed
- Do not use deprecated native BSON parser by default.

## [1.0.1] - 2015-05-07

## [1.0.0] - 2015-04-08

## [0.1.1] - 2015-03-06

### Fixed
- Fix duplicate key error when adding users to the local collection in
  MongoDB 2.4.

## 0.1.0 - 2015-02-23

- See git history for changes.

[Unreleased]: https://github.com/digitalbazaar/bedrock-mongodb/compare/2.1.2...HEAD
[2.1.2]: https://github.com/digitalbazaar/bedrock-mongodb/compare/2.1.1...2.1.2
[2.1.1]: https://github.com/digitalbazaar/bedrock-mongodb/compare/2.1.0...2.1.1
[2.1.0]: https://github.com/digitalbazaar/bedrock-mongodb/compare/2.0.1...2.1.0
[2.0.1]: https://github.com/digitalbazaar/bedrock-mongodb/compare/2.0.0...2.0.1
[2.0.0]: https://github.com/digitalbazaar/bedrock-mongodb/compare/1.1.0...2.0.0
[1.1.0]: https://github.com/digitalbazaar/bedrock-mongodb/compare/1.0.2...1.1.0
[1.0.1]: https://github.com/digitalbazaar/bedrock-mongodb/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/digitalbazaar/bedrock-mongodb/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/digitalbazaar/bedrock-mongodb/compare/0.1.1...1.0.0
[0.1.1]: https://github.com/digitalbazaar/bedrock-mongodb/compare/0.1.0...0.1.1
