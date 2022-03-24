/*!
 * Copyright (c) 2012-2022 Digital Bazaar, Inc. All rights reserved.
 */
import url from 'url';

export function create(config) {
  let url = 'mongodb://';
  if(config.username) {
    url += `${config.username}:${config.password}@`;
  }
  url += `${config.host}:${config.port}/${config.name}`;
  // this needs to come last
  if(config.username) {
    url += `?authSource=${config.connectOptions.authSource || 'admin'}`;
  }
  return url;
}

export function sanitize(path) {
  const urlParts = url.parse(path);
  return `${urlParts.protocol}//${urlParts.host}${urlParts.path}`;
}
