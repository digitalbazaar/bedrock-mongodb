/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as urls from './urls.js';
import {isDatabaseError} from './helpers.js';
import {loginUser} from './authn.js';
import {MDBE_USER_NOT_FOUND} from './exceptions.js';

export async function promptToCreateUser() {
  const config = bedrock.config.mongodb;
  console.log('\nA new, upgrade, or incomplete database setup scenario ' +
    'has been detected. To ensure the database "' + config.name +
    '" exists and its primary user "' + config.username + '" ' +
    'exists and has sufficient access privileges, please enter the ' +
    'following information.');

  // prompt for admin credentials
  const auth = await _getAdminCredentials();

  // authenticate w/server as admin
  const opts = {
    ...config.authentication,
    ...config.connectOptions,
    authSource: auth.authSource
  };
  // in case you forget to enter an authSource in the config it is added here
  if(!config.connectOptions.authSource) {
    config.connectOptions.authSource = auth.authSource;
  }
  const adminConfig = {...config, ...auth};
  const url = urls.create(adminConfig);

  // this returns the client logged in as the admin
  const client = await loginUser({auth, opts, url});

  // try to get server info to confirm proper authN as admin
  const db = client.db(auth.authSource);
  await db.admin().serverInfo(null);

  // ensure the configured user has the appropriate roles
  // TODO: refactor to avoid removing user; driver doesn't seem to provide
  // high-level calls for granting roles, etc. so here we just remove the
  // whole user and replace it entirely
  try {
    await db.removeUser(config.username);
  } catch(e) {
    // ignore user not found, throw all other errors
    if(!(isDatabaseError(e) && e.code === MDBE_USER_NOT_FOUND)) {
      throw e;
    }
  }

  // add configured user
  await db.addUser(config.username, config.password, _getAddUserOptions());
}

async function _getAdminCredentials() {
  return (await import('prompt'))
    .start()
    .get({
      properties: {
        username: {
          description: 'Enter the MongoDB administrator username',
          pattern: /^.{4,}$/,
          message: 'The username must be at least 4 characters.',
          default: 'admin'
        },
        password: {
          description: 'Enter the MongoDB administrator password',
          pattern: /^.{8,}$/,
          message: 'The password must be at least 8 characters.',
          hidden: true,
          default: 'password'
        },
        authSource: {
          description: 'Enter the MongoDB administrator database',
          pattern: /^.{4,}$/,
          message: 'The authSource must be at least 4 characters.',
          default: 'admin'
        }
      }
    });
}

function _getAddUserOptions() {
  const config = bedrock.config.mongodb;
  return bedrock.util.extend({}, config.writeOptions, {
    roles: [
      'dbOwner',
      {role: 'dbAdmin', db: config.name, collection: config.collection},
      {role: 'readWrite', db: config.name, collection: config.collection}
    ]
  });
}
