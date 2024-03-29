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

export function create(config) {
  let url = `${config.protocol}://`;
  if(config.username) {
    url += `${config.username}:${config.password}@`;
  }
  url += config.host;
  url += _addPort(config.port);
  url += `/${config.name}`;
  // this needs to come last
  if(config.username) {
    url += `?authSource=${config.connectOptions.authSource || 'admin'}`;
  }
  return url;
}

/**
 * Adds a port to the url provided the port is valid.
 *
 * @private
 *
 * @param {number|string} port - The port of the server.
 *
 * @throws {TypeError} Throws if the port is not a number gte 1.
 *
 * @returns {string} - The resulting port.
 */
function _addPort(port) {
  if(port === null || port === undefined) {
    return '';
  }
  if(!assertPort(port)) {
    throw new TypeError(`"port" (${port}) must be an integer > 0.`);
  }
  return `:${port}`;
}

/**
 * Tests if the config.port is a valid TCP Port.
 *
 * @param {string|number} port - The config.port.
 *
 * @returns {boolean} If it is a valid TCP port.
 */
function assertPort(port) {
  return Number.parseInt(port) >= 1;
}

export function sanitize(path) {
  const urlParts = new URL(path);
  return `${urlParts.protocol}//${urlParts.host}${urlParts.pathname}`;
}
