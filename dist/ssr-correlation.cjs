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
var import_react = require("react");

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

// src/ssr-correlation.ts
var MIDDLEWARE_SSR_HEADER_NAMES = [
  SSR_ID_REQUEST_HEADER,
  "x-ssr-id",
  SSR_ID_HEADER,
  "x-middleware-request-x-devtools-ssr-id"
];
var readSsrIdFromAppRouterHeaders = (0, import_react.cache)(async () => {
  try {
    if (typeof require === "undefined") {
      return null;
    }
    const { headers: headersFn } = require("next/headers");
    const store = await Promise.resolve(headersFn());
    for (const name of MIDDLEWARE_SSR_HEADER_NAMES) {
      const raw = store.get(name);
      if (raw && isValidForwardedSsrId(raw)) {
        return raw;
      }
    }
  } catch {
  }
  return null;
});
var bindDevtoolsSsrCorrelation = (0, import_react.cache)(async () => {
  return readSsrIdFromAppRouterHeaders();
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  bindDevtoolsSsrCorrelation,
  readSsrIdFromAppRouterHeaders
});
