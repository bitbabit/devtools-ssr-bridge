import {
  pinSsrIdForRequest
} from "./chunk-VGQOXZUY.js";
import {
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  isValidForwardedSsrId
} from "./chunk-DBLTRXN2.js";
import {
  __require
} from "./chunk-3RG5ZIWI.js";

// src/ssr-correlation.ts
import "server-only";
var MIDDLEWARE_SSR_HEADER_NAMES = [
  SSR_ID_REQUEST_HEADER,
  "x-ssr-id",
  SSR_ID_HEADER,
  "x-middleware-request-x-devtools-ssr-id"
];
async function readSsrIdFromHeaders() {
  try {
    if (typeof __require === "undefined") {
      return null;
    }
    const { headers: headersFn } = __require("next/headers");
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

export {
  readSsrIdFromAppRouterHeaders,
  bindDevtoolsSsrCorrelation
};
