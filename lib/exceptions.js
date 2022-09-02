/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
export const MDBE_ERROR = 'MongoError';
export const WRITE_ERROR = 'WriteError';
export const BULK_WRITE_ERROR = 'BulkWriteError';
export const WRITE_CONCERN_ERROR = 'WriteConcernError';
export const MDBE_ERRORS = [
  MDBE_ERROR,
  WRITE_ERROR,
  BULK_WRITE_ERROR,
  WRITE_CONCERN_ERROR
];
// authentication on the server failed
export const MDBE_AUTHN_FAILED = 18;
// authenticated but user is not authorized to perform
// the query or action such as insert
export const MDBE_AUTHZ_FAILED = 13;
export const MDBE_DUPLICATE = 11000;
export const MDBE_DUPLICATE_ON_UPDATE = 11001;
export const MDBE_USER_NOT_FOUND = 11;
