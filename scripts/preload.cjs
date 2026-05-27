const Module = require('module');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, parent, ...args) {
  if (request === 'server-only') {
    return request;
  }
  return originalResolve.call(this, request, parent, ...args);
};

const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === 'server-only') {
    return {};
  }
  return originalLoad.call(this, request, parent, ...args);
};
