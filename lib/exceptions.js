/*!
 * Copyright 2012 - 2024 Digital Bazaar, Inc.
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
export const MDBE_AUTHN_FAILED = 18;
export const MDBE_AUTHZ_FAILED = 13;
export const MDBE_DUPLICATE = 11000;
export const MDBE_DUPLICATE_ON_UPDATE = 11001;
export const MDBE_USER_NOT_FOUND = 11;
