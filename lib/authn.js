/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import mongo from 'mongodb';
const {MongoClient} = mongo;

/**
 * Logs in a user using an auth object.
 *
 * @param {object} options - Options to use.
 * @param {object} options.auth - User and password credentials:
 *   options.auth.user - The MongoDB username
 *   options.auth.password - The MongoDB password.
 * @param {object} options.opts - Options for the MongoClient.
 * @param {string} options.url - A mongo connection string.
 *
 * @returns {Promise<MongoClient>} The result of the connect.
*/
export async function loginUser({auth, opts, url}) {
  return MongoClient.connect(url, {auth, ...opts});
}
