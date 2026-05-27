import {
  DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER,
  createSsrId,
  deserializeDevToolsConfig,
  isValidForwardedSsrId
} from "./chunk-DBLTRXN2.js";
import {
  __require
} from "./chunk-3RG5ZIWI.js";

// src/instrument.ts
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
var fetchPatched = false;
var requestScopedSsrIds = /* @__PURE__ */ new WeakMap();
var BRIDGE_DEBUG_ENABLED = process.env.DEVTOOLS_SSR_BRIDGE_DEBUG === "1";
function safeRequire(id) {
  if (typeof __require !== "undefined") {
    return __require(id);
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
function register() {
  debugLog("register() called");
  patchFetch();
  if (typeof __require !== "undefined") {
    try {
      const axiosModule = __require("axios");
      const axios = axiosModule.default ?? axiosModule;
      patchAxios(axios);
      patchAxiosCreate(axios);
    } catch {
      debugLog("register: axios not available to patch");
    }
  }
}
function patchFetch() {
  if (fetchPatched) {
    debugLog("patchFetch skipped: already patched");
    return;
  }
  const originalFetch = globalThis.fetch;
  fetchPatched = true;
  globalThis.fetch = async function devToolsPatchedFetch(input, init) {
    const url = extractUrl(input);
    debugLog("fetch intercepted", { url });
    if (!url) {
      return originalFetch(input, init);
    }
    const context = await readRequestContext();
    const cfg = context?.config;
    if (!cfg || !cfg.enabled) {
      debugLog("fetch skipped: bridge config missing or disabled", { url });
      return originalFetch(input, init);
    }
    if (!shouldInjectHeaders(url, cfg)) {
      debugLog("fetch skipped: URL did not match allowed paths", { url });
      return originalFetch(input, init);
    }
    const ssrId = getOrCreateSsrId(context?.requestScopeKey, context?.forwardedSsrId ?? null);
    const debugHeaders = buildHeaders(cfg, ssrId);
    const mergedInit = mergeInit(init, debugHeaders);
    debugLog("fetch injecting debug headers", { url, ssrId });
    return originalFetch(input, mergedInit);
  };
}
function patchAxiosDefault() {
}
function patchAxiosCreate(axiosModule) {
  if (typeof axiosModule.create !== "function") {
    return;
  }
  const originalCreate = axiosModule.create.bind(axiosModule);
  axiosModule.create = (...args) => {
    const instance = originalCreate(...args);
    patchAxios(instance);
    return instance;
  };
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
async function getDebugHeaders(url) {
  const context = await readRequestContext();
  const cfg = context?.config;
  if (!cfg || !cfg.enabled) return null;
  if (!shouldInjectHeaders(url, cfg)) return null;
  const ssrId = getOrCreateSsrId(context?.requestScopeKey, context?.forwardedSsrId ?? null);
  return buildHeaders(cfg, ssrId);
}
function extractUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) return input.url;
  return null;
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
    const mod = await import("./ssr-correlation.js");
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
function mergeInit(init, debugHeaders) {
  const merged = new Headers(init?.headers ?? {});
  for (const [key, value] of Object.entries(debugHeaders)) {
    if (!merged.has(key)) {
      merged.set(key, value);
    }
  }
  return { ...init, headers: merged };
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

export {
  register,
  patchFetch,
  patchAxiosDefault,
  patchAxiosCreate,
  patchAxios,
  getDebugHeaders
};
