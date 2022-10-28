/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
// Mongo DB Errors
export const MDBE_ERROR = 'MongoError';
export const MDBE_API_ERROR = 'MongoAPIError';
export const MDBE_AWS_ERROR = 'MongoAWSError';
export const MDBE_BATCH_REEXECUTION_ERROR = 'MongoBatchReExecutionError';
export const MDBE_BULK_WRITE_ERROR = 'MongoBulkWriteError';
export const MDBE_CHANGE_STREAM_ERROR = 'MongoChangeStreamError';
export const MDBE_COMPATIBILITY_ERROR = 'MongoCompatibilityError';
export const MDBE_CURSOR_EXHAUSTED_ERROR = 'MongoCursorExhaustedError';
export const MDBE_CURSOR_IN_USE_ERROR = 'MongoCursorInUseError';
export const MDBE_DECOMPRESSION_ERROR = 'MongoDecompressionError';
export const MDBE_DRIVER_ERROR = 'MongoDriverError';
export const MDBE_EXPIRED_SESSION_ERROR = 'MongoExpiredSessionError';
export const MDBE_GRID_FS_CHUNK_ERROR = 'MongoGridFSChunkError';
export const MDBE_GRID_FS_STREAM_ERROR = 'MongoGridFSStreamError';
export const MDBE_INVALID_ARGUMENT_ERROR = 'MongoInvalidArgumentError';
export const MDBE_KERBEROS_ERROR = 'MongoKerberosError';
export const MDBE_MISSING_CREDENTIALS_ERROR = 'MongoMissingCredentialsError';
export const MDBE_MISSING_DEPENDENCY_ERROR = 'MongoMissingDependencyError';
export const MDBE_SERVER_ERROR = 'MongoServerError';
export const MDBE_WRITE_CONCERN_ERROR = 'MongoWriteConcernError';
// Errors outside of the Mongo class of Errors
export const WRITE_CONCERN_ERROR = 'WriteConcernError';
export const WRITE_ERROR = 'WriteError';
// Set of all MDBE related errors
export const MDBE_ERRORS = new Set([
  MDBE_ERROR,
  MDBE_API_ERROR,
  MDBE_AWS_ERROR,
  MDBE_BATCH_REEXECUTION_ERROR,
  MDBE_BULK_WRITE_ERROR,
  MDBE_CHANGE_STREAM_ERROR,
  MDBE_COMPATIBILITY_ERROR,
  MDBE_CURSOR_EXHAUSTED_ERROR,
  MDBE_CURSOR_IN_USE_ERROR,
  MDBE_DECOMPRESSION_ERROR,
  MDBE_DRIVER_ERROR,
  MDBE_EXPIRED_SESSION_ERROR,
  MDBE_GRID_FS_CHUNK_ERROR,
  MDBE_GRID_FS_STREAM_ERROR,
  MDBE_INVALID_ARGUMENT_ERROR,
  MDBE_KERBEROS_ERROR,
  MDBE_MISSING_CREDENTIALS_ERROR,
  MDBE_MISSING_DEPENDENCY_ERROR,
  MDBE_SERVER_ERROR,
  MDBE_WRITE_CONCERN_ERROR,
  WRITE_CONCERN_ERROR,
  WRITE_ERROR
]);
export const MDBE_AUTHN_FAILED = 18;
export const MDBE_AUTHZ_FAILED = 13;
export const MDBE_DUPLICATE = 11000;
export const MDBE_DUPLICATE_ON_UPDATE = 11001;
export const MDBE_USER_NOT_FOUND = 11;
