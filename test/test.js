/*!
 * Copyright (c) 2019-2024 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as bedrock from '@bedrock/core';
import '@bedrock/mongodb';
import '@bedrock/test';

bedrock.start().catch(err => console.error(err));
