/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
export function create(config) {
  let url = 'mongodb://';
  if(config.username) {
    url += `${config.username}:${config.password}@`;
  }
  url += config.host;
  if(assertPort(config.port)) {
    url += `:${config.port}`;
  }
  url += `/${config.name}`;
  // this needs to come last
  if(config.username) {
    url += `?authSource=${config.connectOptions.authSource || 'admin'}`;
  }
  return url;
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
