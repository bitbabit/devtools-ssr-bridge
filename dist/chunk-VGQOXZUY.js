import {
  isValidForwardedSsrId
} from "./chunk-DBLTRXN2.js";
import {
  __require
} from "./chunk-3RG5ZIWI.js";

// src/ssr-id-store.ts
var activeSsrIdAls;
function getAls() {
  if (activeSsrIdAls !== void 0) {
    return activeSsrIdAls;
  }
  if (typeof __require === "undefined") {
    activeSsrIdAls = null;
    return null;
  }
  try {
    const { AsyncLocalStorage } = __require("async_hooks");
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

export {
  pinSsrIdForRequest,
  getPinnedSsrId
};
