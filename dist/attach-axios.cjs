"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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
var SSR_ID_HEADER, SSR_ID_REQUEST_HEADER, DEBUG_MODE_HEADER, DEBUG_API_KEY_HEADER, SSR_SOURCE_HEADER, DEVTOOLS_CONFIG_COOKIE, DEVTOOLS_CONFIG_TTL, MAX_API_KEY_LENGTH, MAX_CUSTOM_HEADER_COUNT, MAX_ALLOWED_PATH_COUNT, HEADER_NAME_TOKEN_REGEX;
var init_core = __esm({
  "src/core.ts"() {
    "use strict";
    SSR_ID_HEADER = "X-SSR-ID";
    SSR_ID_REQUEST_HEADER = "x-devtools-ssr-id";
    DEBUG_MODE_HEADER = "X-Debug-Mode";
    DEBUG_API_KEY_HEADER = "X-Debug-Api-Key";
    SSR_SOURCE_HEADER = "X-SSR-Source";
    DEVTOOLS_CONFIG_COOKIE = "__devtools_config";
    DEVTOOLS_CONFIG_TTL = 6 * 60 * 60;
    MAX_API_KEY_LENGTH = 512;
    MAX_CUSTOM_HEADER_COUNT = 32;
    MAX_ALLOWED_PATH_COUNT = 32;
    HEADER_NAME_TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  }
});

// src/ssr-id-store.ts
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
var activeSsrIdAls;
var init_ssr_id_store = __esm({
  "src/ssr-id-store.ts"() {
    "use strict";
    init_core();
  }
});

// src/ssr-correlation.ts
var ssr_correlation_exports = {};
__export(ssr_correlation_exports, {
  bindDevtoolsSsrCorrelation: () => bindDevtoolsSsrCorrelation,
  readSsrIdFromAppRouterHeaders: () => readSsrIdFromAppRouterHeaders
});
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
var import_server_only, MIDDLEWARE_SSR_HEADER_NAMES;
var init_ssr_correlation = __esm({
  "src/ssr-correlation.ts"() {
    "use strict";
    import_server_only = require("server-only");
    init_core();
    init_ssr_id_store();
    MIDDLEWARE_SSR_HEADER_NAMES = [
      SSR_ID_REQUEST_HEADER,
      "x-ssr-id",
      SSR_ID_HEADER,
      "x-middleware-request-x-devtools-ssr-id"
    ];
  }
});

// src/attach-axios.ts
var attach_axios_exports = {};
__export(attach_axios_exports, {
  attachAxiosSsrDevtools: () => attachAxiosSsrDevtools,
  patchAxios: () => patchAxios
});
module.exports = __toCommonJS(attach_axios_exports);

// src/instrument.ts
init_core();
init_ssr_id_store();
var FORWARDED_SSR_HEADER_NAMES = [
  SSR_ID_REQUEST_HEADER,
  "x-ssr-id",
  SSR_ID_HEADER,
  "x-middleware-request-x-devtools-ssr-id"
];
var DEFAULT_ALLOWED_PATHS = ["/graphql", "/rest/V", "/rest/all/V", "/api/"];
var BLOCKED_HEADER_NAMES = /* @__PURE__ */ new Set([
  "host",
  "cookie",
  "set-cookie",
  "content-length",
  "transfer-encoding",
  "connection",
  "proxy-authorization",
  "proxy-authenticate"
]);
var requestScopedSsrIds = /* @__PURE__ */ new WeakMap();
var BRIDGE_DEBUG_ENABLED = process.env.DEVTOOLS_SSR_BRIDGE_DEBUG === "1";
function safeRequire(id) {
  if (typeof require !== "undefined") {
    return require(id);
  }
  throw new Error(
    `devtools-ssr-bridge: cannot load "${id}" \u2014 no CommonJS require in this bundle. Use the CJS build: package exports \`"node": "./dist/instrument.cjs"\` for \`./instrument\`.`
  );
}
async function normalizeDynamicApiResult(result) {
  return await Promise.resolve(result);
}
async function establishRequestContextForDynamicApis() {
  try {
    const mod = safeRequire("next/server");
    if (typeof mod.connection === "function") {
      await normalizeDynamicApiResult(mod.connection());
    }
  } catch {
  }
}
function patchAxios(axiosInstance) {
  return axiosInstance.interceptors.request.use(
    async (requestConfig) => {
      const url = resolveAxiosUrl(requestConfig);
      if (!url) return requestConfig;
      const context = await readRequestContext();
      const cfg = context?.config;
      if (!cfg || !cfg.enabled) return requestConfig;
      if (!shouldInjectHeaders(url, cfg)) return requestConfig;
      const ssrId = getOrCreateSsrId(context?.requestScopeKey, context?.forwardedSsrId ?? null);
      const debugHeaders = buildHeaders(cfg, ssrId);
      requestConfig.headers = requestConfig.headers ?? {};
      for (const [key, value] of Object.entries(debugHeaders)) {
        if (!(key in requestConfig.headers)) {
          requestConfig.headers[key] = value;
        }
      }
      debugLog("axios interceptor injecting", { url, ssrId });
      return requestConfig;
    }
  );
}
function resolveAxiosUrl(config) {
  const base = config.baseURL ?? "";
  const path = config.url ?? "";
  if (!base && !path) return null;
  if (base && path) {
    try {
      return new URL(path, base).href;
    } catch {
      return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    }
  }
  return base || path || null;
}
async function readRequestContext() {
  try {
    await establishRequestContextForDynamicApis();
    const { cookies: cookiesFn } = safeRequire("next/headers");
    const cookieStore = await normalizeDynamicApiResult(cookiesFn());
    if (!cookieStore || typeof cookieStore !== "object" || typeof cookieStore.get !== "function") {
      return await tryEnvFallbackContext();
    }
    const raw = cookieStore.get(DEVTOOLS_CONFIG_COOKIE)?.value;
    const config = deserializeDevToolsConfig(raw);
    if (!config) {
      return await tryEnvFallbackContext();
    }
    const forwardedSsrId = await readCorrelatedSsrId(cookieStore);
    return { config, requestScopeKey: cookieStore, forwardedSsrId };
  } catch {
    debugLog("readRequestContext: outside next request context");
  }
  return await tryEnvFallbackContext();
}
async function tryEnvFallbackContext() {
  if (process.env.MAGENTO_DEVTOOLS_ENABLED !== "true") {
    return null;
  }
  const apiKey = process.env.MAGENTO_DEVTOOLS_API_KEY ?? "";
  const config = {
    enabled: true,
    apiKey,
    customHeaders: {},
    allowedPaths: [],
    createdAt: Date.now()
  };
  const forwardedSsrId = await readCorrelatedSsrId();
  return { config, requestScopeKey: void 0, forwardedSsrId };
}
async function readCorrelatedSsrId(_cookieStore) {
  try {
    const mod = await Promise.resolve().then(() => (init_ssr_correlation(), ssr_correlation_exports));
    const fromLayoutCache = await mod.readSsrIdFromAppRouterHeaders();
    if (fromLayoutCache) {
      return fromLayoutCache;
    }
  } catch {
  }
  try {
    await establishRequestContextForDynamicApis();
    const { headers: headersFn } = safeRequire("next/headers");
    const store = await normalizeDynamicApiResult(headersFn());
    if (!store || typeof store !== "object" || typeof store.get !== "function") {
      return null;
    }
    const headerStore = store;
    for (const name of FORWARDED_SSR_HEADER_NAMES) {
      const raw = headerStore.get(name);
      if (raw && isValidForwardedSsrId(raw)) {
        return raw;
      }
    }
  } catch {
  }
  return null;
}
function shouldInjectHeaders(url, config) {
  const paths = config.allowedPaths && config.allowedPaths.length > 0 ? config.allowedPaths : DEFAULT_ALLOWED_PATHS;
  const requestPathname = getPathname(url);
  if (!requestPathname) return false;
  return paths.some((path) => requestPathname.startsWith(path));
}
function getOrCreateSsrId(requestScopeKey, forwardedSsrId) {
  if (forwardedSsrId && isValidForwardedSsrId(forwardedSsrId)) {
    if (requestScopeKey) {
      requestScopedSsrIds.set(requestScopeKey, forwardedSsrId);
    }
    return forwardedSsrId;
  }
  if (requestScopeKey && requestScopedSsrIds.has(requestScopeKey)) {
    return requestScopedSsrIds.get(requestScopeKey);
  }
  const id = createSsrId();
  if (requestScopeKey) {
    requestScopedSsrIds.set(requestScopeKey, id);
  }
  debugLog("SSR id created without middleware header \u2014 check bindDevtoolsSsrCorrelation in root layout");
  return id;
}
function buildHeaders(config, ssrId) {
  const headers = {
    [DEBUG_MODE_HEADER]: "true",
    [SSR_ID_HEADER]: ssrId,
    [SSR_SOURCE_HEADER]: "nextjs"
  };
  if (config.apiKey) {
    headers[DEBUG_API_KEY_HEADER] = config.apiKey;
  }
  const safeCustomHeaders = sanitizeCustomHeaders(config.customHeaders ?? {});
  Object.assign(headers, safeCustomHeaders);
  return headers;
}
function sanitizeCustomHeaders(customHeaders) {
  const result = {};
  for (const [key, value] of Object.entries(customHeaders)) {
    const normalizedName = key.trim().toLowerCase();
    const normalizedValue = value.trim();
    if (!normalizedName || !normalizedValue || BLOCKED_HEADER_NAMES.has(normalizedName)) {
      continue;
    }
    result[key] = normalizedValue;
  }
  return result;
}
function getPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    if (!url.startsWith("/")) return null;
    return url;
  }
}
function debugLog(message, meta) {
  if (!BRIDGE_DEBUG_ENABLED) {
    return;
  }
  if (meta) {
    console.log(`[devtools-ssr-bridge] ${message}`, meta);
    return;
  }
  console.log(`[devtools-ssr-bridge] ${message}`);
}

// src/attach-axios.ts
function attachAxiosSsrDevtools(...instances) {
  if (typeof window !== "undefined") {
    return;
  }
  for (const inst of instances) {
    patchAxios(inst);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  attachAxiosSsrDevtools,
  patchAxios
});
