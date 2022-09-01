/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
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
    throw new TypeError(
      `Expected port to be a number greater than 0 received ${port}`);
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
