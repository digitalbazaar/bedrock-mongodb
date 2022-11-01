/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */

import {MongoError} from 'mongodb';

// Mongo DB Errors
// Errors outside of the Mongo class of Errors
export const WRITE_CONCERN_ERROR = 'WriteConcernError';
export const WRITE_ERROR = 'WriteError';
export const MDBE_WRITE_CONCERN_ERROR = 'MongoWriteConcernError';

export const assertMongoError = error => error instanceof MongoError;

export const MDBE_AUTHN_FAILED = 18;
export const MDBE_AUTHZ_FAILED = 13;
export const MDBE_DUPLICATE = 11000;
export const MDBE_DUPLICATE_ON_UPDATE = 11001;
export const MDBE_USER_NOT_FOUND = 11;
