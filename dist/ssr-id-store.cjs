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

// src/ssr-id-store.ts
var ssr_id_store_exports = {};
__export(ssr_id_store_exports, {
  getPinnedSsrId: () => getPinnedSsrId,
  pinSsrIdForRequest: () => pinSsrIdForRequest
});
module.exports = __toCommonJS(ssr_id_store_exports);

// src/core.ts
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
function getPinnedSsrId() {
  const id = getAls()?.getStore();
  return id && isValidForwardedSsrId(id) ? id : void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getPinnedSsrId,
  pinSsrIdForRequest
});
