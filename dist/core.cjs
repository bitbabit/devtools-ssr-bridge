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

// src/core.ts
var core_exports = {};
__export(core_exports, {
  DEBUG_API_KEY_HEADER: () => DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER: () => DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE: () => DEVTOOLS_CONFIG_COOKIE,
  DEVTOOLS_CONFIG_TTL: () => DEVTOOLS_CONFIG_TTL,
  DEVTOOLS_PROBE_COOKIE: () => DEVTOOLS_PROBE_COOKIE,
  DEVTOOLS_PROBE_TTL: () => DEVTOOLS_PROBE_TTL,
  SSR_ID_HEADER: () => SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER: () => SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER: () => SSR_SOURCE_HEADER,
  buildDebugHeaders: () => buildDebugHeaders,
  createDebugFetch: () => createDebugFetch,
  createSsrId: () => createSsrId,
  deserializeDevToolsConfig: () => deserializeDevToolsConfig,
  isValidForwardedSsrId: () => isValidForwardedSsrId,
  mergeHeaders: () => mergeHeaders,
  resolveDebugApiKey: () => resolveDebugApiKey,
  serializeDevToolsConfig: () => serializeDevToolsConfig
});
module.exports = __toCommonJS(core_exports);
var SSR_ID_HEADER = "X-SSR-ID";
var SSR_ID_REQUEST_HEADER = "x-devtools-ssr-id";
var DEBUG_MODE_HEADER = "X-Debug-Mode";
var DEBUG_API_KEY_HEADER = "X-Debug-Api-Key";
var SSR_SOURCE_HEADER = "X-SSR-Source";
var DEVTOOLS_PROBE_COOKIE = "__devtools_probe";
var DEVTOOLS_CONFIG_COOKIE = "__devtools_config";
var DEVTOOLS_PROBE_TTL = 300;
var DEVTOOLS_CONFIG_TTL = 6 * 60 * 60;
var MAX_API_KEY_LENGTH = 512;
var MAX_CUSTOM_HEADER_COUNT = 32;
var MAX_ALLOWED_PATH_COUNT = 32;
var HEADER_NAME_TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function serializeDevToolsConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}
function deserializeDevToolsConfig(raw) {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!isObject(parsed) || typeof parsed.enabled !== "boolean") {
      return null;
    }
    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim().slice(0, MAX_API_KEY_LENGTH) : "";
    const customHeaders = normalizeCustomHeaders(parsed.customHeaders);
    const allowedPaths = normalizeAllowedPaths(parsed.allowedPaths);
    const createdAt = typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : Date.now();
    return {
      enabled: parsed.enabled,
      apiKey,
      customHeaders,
      allowedPaths,
      createdAt
    };
  } catch {
  }
  return null;
}
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function normalizeCustomHeaders(input) {
  if (!isObject(input)) {
    return {};
  }
  const result = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_CUSTOM_HEADER_COUNT) {
      break;
    }
    const normalizedKey = String(key).trim();
    const normalizedValue = typeof value === "string" ? value.trim() : "";
    if (!normalizedKey || !normalizedValue || !HEADER_NAME_TOKEN_REGEX.test(normalizedKey)) {
      continue;
    }
    result[normalizedKey] = normalizedValue;
    count++;
  }
  return result;
}
function normalizeAllowedPaths(input) {
  if (!Array.isArray(input)) {
    return ["/graphql", "/rest/V", "/api/"];
  }
  const result = [];
  for (const item of input) {
    if (result.length >= MAX_ALLOWED_PATH_COUNT || typeof item !== "string") {
      continue;
    }
    const path = item.trim();
    if (!path || !path.startsWith("/")) {
      continue;
    }
    result.push(path);
  }
  return result.length > 0 ? result : ["/graphql", "/rest/V", "/api/"];
}
function resolveDebugApiKey(options) {
  const direct = options.apiKey?.trim();
  if (direct) {
    return direct;
  }
  return options.getApiKey?.()?.trim() || void 0;
}
function createSsrId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function isValidForwardedSsrId(id) {
  if (id === "" || id.length > 128) {
    return false;
  }
  return /^[a-zA-Z0-9._:-]+$/.test(id);
}
function buildDebugHeaders(options) {
  const enabled = options.enabled ?? true;
  const headers = {};
  const apiKey = resolveDebugApiKey(options);
  if (enabled) {
    headers[DEBUG_MODE_HEADER] = "true";
  }
  if (apiKey) {
    headers[DEBUG_API_KEY_HEADER] = apiKey;
  }
  if (options.ssrId) {
    headers[SSR_ID_HEADER] = options.ssrId;
  }
  if (options.source) {
    headers[SSR_SOURCE_HEADER] = options.source;
  }
  return headers;
}
function mergeHeaders(base, extra) {
  const headers = new Headers(base ?? {});
  Object.entries(extra).forEach(([key, value]) => headers.set(key, value));
  return headers;
}
function createDebugFetch(fetchImpl, config) {
  return async (input, init) => {
    const ssrId = init?.ssrId ?? config.ssrIdFactory?.() ?? createSsrId();
    const debugHeaders = buildDebugHeaders({
      enabled: config.enabled ?? true,
      apiKey: config.apiKey,
      getApiKey: config.getApiKey,
      ssrId,
      source: config.source
    });
    const headers = mergeHeaders(init?.headers, debugHeaders);
    return fetchImpl(input, { ...init, headers });
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE,
  DEVTOOLS_CONFIG_TTL,
  DEVTOOLS_PROBE_COOKIE,
  DEVTOOLS_PROBE_TTL,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER,
  buildDebugHeaders,
  createDebugFetch,
  createSsrId,
  deserializeDevToolsConfig,
  isValidForwardedSsrId,
  mergeHeaders,
  resolveDebugApiKey,
  serializeDevToolsConfig
});
