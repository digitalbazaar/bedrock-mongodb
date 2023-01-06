/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */

import {MongoError} from 'mongodb';

// Mongo DB Errors
// thrown inside of a MongoServerError
export const WRITE_ERROR = 'WriteError';
// throw inside of a MongoServerError
export const WRITE_CONCERN_ERROR = 'WriteConcernError';

export const MDBE_ERRORS = new Set([
  WRITE_ERROR,
  WRITE_CONCERN_ERROR
]);

export const assertMongoError = error =>
  (error instanceof MongoError) || MDBE_ERRORS.has(error.name);

export const MDBE_AUTHN_FAILED = 18;
export const MDBE_AUTHZ_FAILED = 13;
export const MDBE_DUPLICATE = 11000;
export const MDBE_DUPLICATE_ON_UPDATE = 11001;
export const MDBE_USER_NOT_FOUND = 11;
