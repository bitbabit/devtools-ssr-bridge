"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/ssr-correlation.ts
var ssr_correlation_exports = {};
__export(ssr_correlation_exports, {
  bindDevtoolsSsrCorrelation: () => bindDevtoolsSsrCorrelation,
  readSsrIdFromAppRouterHeaders: () => readSsrIdFromAppRouterHeaders
});
module.exports = __toCommonJS(ssr_correlation_exports);
var import_server_only = require("server-only");

// src/core.ts
var SSR_ID_HEADER = "X-SSR-ID";
var SSR_ID_REQUEST_HEADER = "x-devtools-ssr-id";
var DEVTOOLS_CONFIG_TTL = 6 * 60 * 60;
function isValidForwardedSsrId(id) {
  if (id === "" || id.length > 128) {
    return false;
  }
  return /^[a-zA-Z0-9._:-]+$/.test(id);
}

// src/ssr-id-store.ts
var activeSsrIdAls;
function getAls() {
  if (activeSsrIdAls !== void 0) {
    return activeSsrIdAls;
  }
  if (typeof require === "undefined") {
    activeSsrIdAls = null;
    return null;
  }
  try {
    const { AsyncLocalStorage } = require("async_hooks");
    activeSsrIdAls = new AsyncLocalStorage();
    return activeSsrIdAls;
  } catch {
    activeSsrIdAls = null;
    return null;
  }
}
function pinSsrIdForRequest(ssrId) {
  if (!isValidForwardedSsrId(ssrId)) {
    return;
  }
  getAls()?.enterWith(ssrId);
}

// src/ssr-correlation.ts
var MIDDLEWARE_SSR_HEADER_NAMES = [
  SSR_ID_REQUEST_HEADER,
  "x-ssr-id",
  SSR_ID_HEADER,
  "x-middleware-request-x-devtools-ssr-id"
];
async function readSsrIdFromHeaders() {
  try {
    if (typeof require === "undefined") {
      return null;
    }
    const { headers: headersFn } = require("next/headers");
    const store = await Promise.resolve(headersFn());
    for (const name of MIDDLEWARE_SSR_HEADER_NAMES) {
      const raw = store.get(name);
      if (raw && isValidForwardedSsrId(raw)) {
        pinSsrIdForRequest(raw);
        return raw;
      }
    }
  } catch {
  }
  return null;
}
async function readSsrIdFromAppRouterHeaders() {
  return readSsrIdFromHeaders();
}
async function bindDevtoolsSsrCorrelation() {
  return readSsrIdFromHeaders();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  bindDevtoolsSsrCorrelation,
  readSsrIdFromAppRouterHeaders
});
