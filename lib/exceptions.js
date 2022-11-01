/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
// Mongo DB Errors
// Errors outside of the Mongo class of Errors
export const WRITE_CONCERN_ERROR = 'WriteConcernError';
export const WRITE_ERROR = 'WriteError';

export const MDBE_API_ERROR = 'MongoAPIError';
export const MDBE_AWS_ERROR = 'MongoAWSError';
export const MDBE_BATCH_REEXECUTION_ERROR = 'MongoBatchReExecutionError';
export const MDBE_BULK_WRITE_ERROR = 'MongoBulkWriteError';
export const MDBE_CHANGE_STREAM_ERROR = 'MongoChangeStreamError';
export const MDBE_COMPATIBILITY_ERROR = 'MongoCompatibilityError';
export const MDBE_CURSOR_EXHAUSTED_ERROR = 'MongoCursorExhaustedError';
export const MDBE_CURSOR_IN_USE_ERROR = 'MongoCursorInUseError';
export const MDBE_DECOMPRESSION_ERROR = 'MongoDecompressionError';
export const MDBE_EXPIRED_SESSION_ERROR = 'MongoExpiredSessionError';
export const MDBE_GRID_FS_CHUNK_ERROR = 'MongoGridFSChunkError';
export const MDBE_GRID_FS_STREAM_ERROR = 'MongoGridFSStreamError';
export const MDBE_INVALID_ARGUMENT_ERROR = 'MongoInvalidArgumentError';
export const MDBE_MISSING_CREDENTIALS_ERROR = 'MongoMissingCredentialsError';
export const MDBE_MISSING_DEPENDENCY_ERROR = 'MongoMissingDependencyError';
export const MDBE_NETWORK_ERROR = 'MongoNetworkError';
export const MDBE_NETWORK_TIMEOUT_ERROR = 'MongoNetworkTimeoutError';
export const MDBE_NOT_CONNECTED_ERROR = 'MongoNotConnectedError';
export const MDBE_PARSE_ERROR = 'MongoParseError';
export const MDBE_RUNTIME_ERROR = 'MongoRunTimeError';
export const MDBE_SERVER_CLOSED_ERROR = 'MongoServerClosedError';
export const MDBE_SERVER_SELECTION_ERROR = 'MongoServerSelectionError';
export const MDBE_TAILABLE_CURSOR_ERROR = 'MongoTailableCursorError';
export const MDBE_TOPOLOGY_CLOSED_ERROR = 'MongoTopologyClosedError';
export const MDBE_TRANSACTION_ERROR = 'MongoTransactionError';
export const MDBE_UNEXPECTED_SERVER_RESPONSE_ERROR =
  'MongoUnexpectedServerResponseError';
export const MDBE_SERVER_ERROR = 'MongoServerError';
export const MDBE_WRITE_CONCERN_ERROR = 'MongoWriteConcernError';
// Set of all MDBE related errors
export const MDBE_ERRORS = new Set([
  MDBE_API_ERROR,
  MDBE_AWS_ERROR,
  MDBE_BATCH_REEXECUTION_ERROR,
  MDBE_BULK_WRITE_ERROR,
  MDBE_CHANGE_STREAM_ERROR,
  MDBE_COMPATIBILITY_ERROR,
  MDBE_CURSOR_EXHAUSTED_ERROR,
  MDBE_CURSOR_IN_USE_ERROR,
  MDBE_DECOMPRESSION_ERROR,
  MDBE_EXPIRED_SESSION_ERROR,
  MDBE_GRID_FS_CHUNK_ERROR,
  MDBE_GRID_FS_STREAM_ERROR,
  MDBE_INVALID_ARGUMENT_ERROR,
  MDBE_MISSING_CREDENTIALS_ERROR,
  MDBE_MISSING_DEPENDENCY_ERROR,
  MDBE_NETWORK_ERROR,
  MDBE_NETWORK_TIMEOUT_ERROR,
  MDBE_NOT_CONNECTED_ERROR,
  MDBE_PARSE_ERROR,
  MDBE_RUNTIME_ERROR,
  MDBE_SERVER_CLOSED_ERROR,
  MDBE_SERVER_SELECTION_ERROR,
  MDBE_TAILABLE_CURSOR_ERROR,
  MDBE_TOPOLOGY_CLOSED_ERROR,
  MDBE_TRANSACTION_ERROR,
  MDBE_UNEXPECTED_SERVER_RESPONSE_ERROR,
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
