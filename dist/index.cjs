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
var SSR_ID_HEADER, SSR_ID_REQUEST_HEADER, DEBUG_MODE_HEADER, DEBUG_API_KEY_HEADER, SSR_SOURCE_HEADER, DEVTOOLS_PROBE_COOKIE, DEVTOOLS_CONFIG_COOKIE, DEVTOOLS_SSR_ID_COOKIE, DEVTOOLS_PROBE_TTL, DEVTOOLS_CONFIG_TTL, MAX_API_KEY_LENGTH, MAX_CUSTOM_HEADER_COUNT, MAX_ALLOWED_PATH_COUNT, HEADER_NAME_TOKEN_REGEX;
var init_core = __esm({
  "src/core.ts"() {
    "use strict";
    SSR_ID_HEADER = "X-SSR-ID";
    SSR_ID_REQUEST_HEADER = "x-devtools-ssr-id";
    DEBUG_MODE_HEADER = "X-Debug-Mode";
    DEBUG_API_KEY_HEADER = "X-Debug-Api-Key";
    SSR_SOURCE_HEADER = "X-SSR-Source";
    DEVTOOLS_PROBE_COOKIE = "__devtools_probe";
    DEVTOOLS_CONFIG_COOKIE = "__devtools_config";
    DEVTOOLS_SSR_ID_COOKIE = "__devtools_ssr_id";
    DEVTOOLS_PROBE_TTL = 300;
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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS: () => CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS,
  CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS: () => CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS,
  DEBUG_API_KEY_HEADER: () => DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER: () => DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE: () => DEVTOOLS_CONFIG_COOKIE,
  DEVTOOLS_CONFIG_TTL: () => DEVTOOLS_CONFIG_TTL,
  DEVTOOLS_PROBE_COOKIE: () => DEVTOOLS_PROBE_COOKIE,
  DEVTOOLS_PROBE_TTL: () => DEVTOOLS_PROBE_TTL,
  DEVTOOLS_SSR_ID_COOKIE: () => DEVTOOLS_SSR_ID_COOKIE,
  DevToolsSetupPopup: () => DevToolsSetupPopup,
  ReactSsrDebugContext: () => ReactSsrDebugContext,
  SSR_ID_HEADER: () => SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER: () => SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER: () => SSR_SOURCE_HEADER,
  attachSsrIdToNextResponse: () => attachSsrIdToNextResponse,
  bindDevtoolsSsrCorrelation: () => bindDevtoolsSsrCorrelation,
  buildDebugHeaders: () => buildDebugHeaders,
  createDebugFetch: () => createDebugFetch,
  createDevToolsConfigHandler: () => createDevToolsConfigHandler,
  createNextSsrContext: () => createNextSsrContext,
  createReactSsrDebugValue: () => createReactSsrDebugValue,
  createSsrContextFromCookies: () => createSsrContextFromCookies,
  createSsrId: () => createSsrId,
  deserializeDevToolsConfig: () => deserializeDevToolsConfig,
  devtoolsSsrCorrelationMiddleware: () => devtoolsSsrCorrelationMiddleware,
  forwardDevtoolsSsrRequestToServer: () => forwardDevtoolsSsrRequestToServer,
  getAutoDebugFetch: () => getAutoDebugFetch,
  getDebugHeaders: () => getDebugHeaders,
  handleDevToolsProbe: () => handleDevToolsProbe,
  hasDevToolsProbe: () => hasDevToolsProbe,
  isValidForwardedSsrId: () => isValidForwardedSsrId,
  mergeHeaders: () => mergeHeaders,
  patchAxios: () => patchAxios,
  patchAxiosCreate: () => patchAxiosCreate,
  patchAxiosDefault: () => patchAxiosDefault,
  patchFetch: () => patchFetch,
  pinSsrIdForRequest: () => pinSsrIdForRequest,
  prepareDevtoolsSsrRequest: () => prepareDevtoolsSsrRequest,
  readDevToolsConfig: () => readDevToolsConfig,
  readSsrIdFromAppRouterHeaders: () => readSsrIdFromAppRouterHeaders,
  register: () => register,
  resolveDebugApiKey: () => resolveDebugApiKey,
  serializeDevToolsConfig: () => serializeDevToolsConfig,
  setSsrIdOnMiddlewareResponse: () => setSsrIdOnMiddlewareResponse,
  shouldAllocateNewDevtoolsSsrId: () => shouldAllocateNewDevtoolsSsrId,
  shouldSkipDevtoolsSsrCorrelation: () => shouldSkipDevtoolsSsrCorrelation,
  useDevToolsProbe: () => useDevToolsProbe,
  useSsrId: () => useSsrId,
  withDevToolsHeaders: () => withDevToolsHeaders,
  withDevtoolsSsrBridge: () => withDevtoolsSsrBridge
});
module.exports = __toCommonJS(index_exports);
init_core();

// src/extension-align.ts
var CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS = [
  "/rest/V",
  "/graphql",
  "/api/",
  "/section/load"
];
var CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS = [
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf"
];

// src/next.ts
init_core();
function createNextSsrContext(config = {}) {
  const ssrId = createSsrId();
  const enabled = config.enabled ?? true;
  const source = config.source ?? "nextjs";
  const apiKey = resolveDebugApiKey(config);
  const headers = {
    [SSR_ID_HEADER]: ssrId,
    [SSR_SOURCE_HEADER]: source
  };
  if (enabled) {
    headers[DEBUG_MODE_HEADER] = "true";
  }
  if (apiKey) {
    headers[DEBUG_API_KEY_HEADER] = apiKey;
  }
  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }
  return {
    ssrId,
    headers,
    debugFetch: createDebugFetch(fetch, {
      enabled,
      apiKey: config.apiKey,
      getApiKey: config.getApiKey,
      source,
      ssrIdFactory: () => ssrId
    })
  };
}
function attachSsrIdToNextResponse(response, ssrId) {
  response.headers.set(SSR_ID_HEADER, ssrId);
}
function handleDevToolsProbe(request, response, options = {}) {
  const debugMode = request.headers.get(DEBUG_MODE_HEADER);
  if (!debugMode) {
    return false;
  }
  const ttl = options.probeTtl ?? DEVTOOLS_PROBE_TTL;
  response.cookies.set(DEVTOOLS_PROBE_COOKIE, "1", {
    path: "/",
    maxAge: ttl,
    sameSite: "lax",
    secure: false,
    // readable by client JS, no httpOnly
    httpOnly: false
  });
  return true;
}
function shouldSkipDevtoolsSsrCorrelation(pathname) {
  const path = pathname.toLowerCase();
  return path.includes("com.chrome.devtools.json") || path.includes("/.well-known/appspecific/");
}
function shouldAllocateNewDevtoolsSsrId(pathname) {
  if (!pathname || shouldSkipDevtoolsSsrCorrelation(pathname)) {
    return false;
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return false;
  }
  return true;
}
function applySsrIdToMiddlewareRequest(request, ssrId) {
  request.headers.set(SSR_ID_REQUEST_HEADER, ssrId);
  request.headers.set(SSR_ID_HEADER, ssrId);
}
function prepareDevtoolsSsrRequest(request, options = {}) {
  const pathname = options.pathname ?? "";
  if (pathname && shouldSkipDevtoolsSsrCorrelation(pathname)) {
    return null;
  }
  if (!request.cookies.get(DEVTOOLS_CONFIG_COOKIE)?.value?.trim()) {
    return null;
  }
  if (!shouldAllocateNewDevtoolsSsrId(pathname)) {
    return null;
  }
  const ssrId = createSsrId();
  applySsrIdToMiddlewareRequest(request, ssrId);
  return ssrId;
}
function setSsrIdOnMiddlewareResponse(response, ssrId) {
  if (!ssrId) {
    return;
  }
  response.headers.set(SSR_ID_HEADER, ssrId);
  if (response.cookies?.set) {
    response.cookies.set(DEVTOOLS_SSR_ID_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      httpOnly: true,
      secure: typeof process !== "undefined" && process.env.NODE_ENV === "production"
    });
  }
}
function forwardDevtoolsSsrRequestToServer(request, response, ssrId, NextResponse) {
  if (!ssrId) {
    return response;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SSR_ID_REQUEST_HEADER, ssrId);
  requestHeaders.set(SSR_ID_HEADER, ssrId);
  const forwarded = NextResponse.next({
    request: { headers: requestHeaders }
  });
  if (response.cookies?.getAll && forwarded.cookies?.set) {
    for (const cookie of response.cookies.getAll()) {
      const { name, value, ...options } = cookie;
      forwarded.cookies.set(name, value, options);
    }
  }
  if (typeof response.headers.forEach === "function") {
    response.headers.forEach((value, key) => {
      forwarded.headers.set(key, value);
    });
  }
  setSsrIdOnMiddlewareResponse(forwarded, ssrId);
  return forwarded;
}
function devtoolsSsrCorrelationMiddleware(request, NextResponse) {
  const ssrId = prepareDevtoolsSsrRequest(request);
  if (!ssrId) {
    return NextResponse.next();
  }
  const response = NextResponse.next();
  return forwardDevtoolsSsrRequestToServer(request, response, ssrId, NextResponse);
}
function createDevToolsConfigHandler(options = {}) {
  const configTtl = options.configTtl ?? DEVTOOLS_CONFIG_TTL;
  async function POST(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!body.apiKey || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return new Response(
        JSON.stringify({ error: "API key is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (options.validateApiKey) {
      const valid = await options.validateApiKey(body.apiKey.trim());
      if (!valid) {
        return new Response(
          JSON.stringify({ error: "API key validation failed" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    const config = {
      enabled: true,
      apiKey: body.apiKey.trim(),
      customHeaders: sanitizeHeaders(body.customHeaders ?? {}),
      allowedPaths: sanitizeAllowedPaths(body.allowedPaths),
      createdAt: Date.now()
    };
    const serialized = serializeDevToolsConfig(config);
    const headers = new Headers({ "Content-Type": "application/json" });
    const isSecure = typeof process !== "undefined" ? process.env.NODE_ENV === "production" : true;
    headers.append(
      "Set-Cookie",
      buildCookieString(DEVTOOLS_CONFIG_COOKIE, serialized, {
        path: "/",
        maxAge: configTtl,
        httpOnly: true,
        secure: isSecure,
        sameSite: "Lax"
      })
    );
    headers.append(
      "Set-Cookie",
      buildCookieString(DEVTOOLS_PROBE_COOKIE, "", {
        path: "/",
        maxAge: 0,
        httpOnly: false,
        secure: false,
        sameSite: "Lax"
      })
    );
    return new Response(
      JSON.stringify({ success: true, ttl: configTtl }),
      { status: 200, headers }
    );
  }
  async function DELETE() {
    const isSecure = typeof process !== "undefined" ? process.env.NODE_ENV === "production" : true;
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append(
      "Set-Cookie",
      buildCookieString(DEVTOOLS_CONFIG_COOKIE, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        secure: isSecure,
        sameSite: "Lax"
      })
    );
    headers.append(
      "Set-Cookie",
      buildCookieString(DEVTOOLS_PROBE_COOKIE, "", {
        path: "/",
        maxAge: 0,
        httpOnly: false,
        secure: false,
        sameSite: "Lax"
      })
    );
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  }
  return { POST, DELETE };
}
function readDevToolsConfig(cookies) {
  const raw = cookies.get(DEVTOOLS_CONFIG_COOKIE)?.value;
  return deserializeDevToolsConfig(raw);
}
function hasDevToolsProbe(cookies) {
  return cookies.get(DEVTOOLS_PROBE_COOKIE)?.value === "1";
}
function createSsrContextFromCookies(cookies, overrides = {}) {
  const config = readDevToolsConfig(cookies);
  if (!config || !config.enabled) {
    return null;
  }
  return createNextSsrContext({
    apiKey: config.apiKey,
    customHeaders: config.customHeaders,
    ...overrides
  });
}
function getAutoDebugFetch(cookies, overrides = {}) {
  const ctx = createSsrContextFromCookies(cookies, overrides);
  if (!ctx) {
    return { fetch: globalThis.fetch, ssrId: null };
  }
  return { fetch: ctx.debugFetch, ssrId: ctx.ssrId };
}
function withDevToolsHeaders(cookies, init = {}) {
  const config = readDevToolsConfig(cookies);
  if (!config || !config.enabled) {
    return init;
  }
  const ssrId = createSsrId();
  const apiKey = config.apiKey;
  const source = "nextjs";
  const debugHeaders = {
    [DEBUG_MODE_HEADER]: "true",
    [SSR_ID_HEADER]: ssrId,
    [SSR_SOURCE_HEADER]: source
  };
  if (apiKey) {
    debugHeaders[DEBUG_API_KEY_HEADER] = apiKey;
  }
  if (config.customHeaders) {
    Object.assign(debugHeaders, config.customHeaders);
  }
  const merged = new Headers(init.headers ?? {});
  for (const [key, value] of Object.entries(debugHeaders)) {
    merged.set(key, value);
  }
  return { ...init, headers: merged };
}
function buildCookieString(name, value, options) {
  const parts = [`${name}=${value}`];
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.maxAge !== void 0) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  return parts.join("; ");
}
function sanitizeHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (trimmedKey && trimmedValue) {
      result[trimmedKey] = trimmedValue;
    }
  }
  return result;
}
function sanitizeAllowedPaths(paths) {
  if (!Array.isArray(paths)) {
    return ["/graphql", "/rest/V", "/api/"];
  }
  const sanitized = paths.map((path) => path.trim()).filter((path) => path.startsWith("/"));
  return sanitized.length > 0 ? sanitized.slice(0, 32) : ["/graphql", "/rest/V", "/api/"];
}
function withDevtoolsSsrBridge(nextConfig = {}) {
  const experimental = typeof nextConfig.experimental === "object" && nextConfig.experimental !== null ? { ...nextConfig.experimental } : {};
  const modernKey = "serverExternalPackages";
  const legacyKey = "serverComponentsExternalPackages";
  const activeKey = modernKey in experimental ? modernKey : legacyKey;
  const existing = Array.isArray(experimental[activeKey]) ? [...experimental[activeKey]] : [];
  if (!existing.includes("axios")) {
    existing.unshift("axios");
  }
  if (!existing.includes("@bitbabit/devtools-ssr-bridge")) {
    existing.push("@bitbabit/devtools-ssr-bridge");
  }
  if (activeKey === modernKey) {
    experimental[modernKey] = existing;
  } else {
    experimental[legacyKey] = existing;
  }
  const userWebpack = nextConfig.webpack;
  return {
    ...nextConfig,
    experimental,
    webpack(config, context) {
      let out = config;
      if (typeof userWebpack === "function") {
        out = userWebpack(out, context);
      }
      const isNodeServer = context.isServer && context.nextRuntime !== "edge";
      if (!isNodeServer) {
        return out;
      }
      const prev = out.externals;
      const markAxiosExternal = (data, callback) => {
        if (data.request === "axios") {
          callback(null, "commonjs axios");
          return;
        }
        callback();
      };
      if (Array.isArray(prev)) {
        out.externals = [...prev, markAxiosExternal];
      } else if (typeof prev === "function") {
        out.externals = [prev, markAxiosExternal];
      } else if (prev !== void 0 && prev !== null) {
        out.externals = [prev, markAxiosExternal];
      } else {
        out.externals = [markAxiosExternal];
      }
      return out;
    }
  };
}

// src/react.ts
var import_react = require("react");
init_core();
var ReactSsrDebugContext = (0, import_react.createContext)(null);
function createReactSsrDebugValue(ssrId) {
  return {
    ssrId: ssrId ?? createSsrId()
  };
}
function useSsrId() {
  const ctx = (0, import_react.useContext)(ReactSsrDebugContext);
  return ctx?.ssrId ?? null;
}
function getCookie(name) {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function deleteCookie(name) {
  if (typeof document !== "undefined") {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}
function useDevToolsProbe() {
  const [probeDetected, setProbeDetected] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    setProbeDetected(getCookie(DEVTOOLS_PROBE_COOKIE) === "1");
  }, []);
  return probeDetected;
}
var DEFAULT_POPUP_STYLE = {
  position: "fixed",
  bottom: "20px",
  right: "20px",
  zIndex: 999999,
  width: "360px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: "13px",
  backgroundColor: "#1e1e2e",
  color: "#cdd6f4",
  border: "1px solid #45475a",
  borderRadius: "8px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  padding: "16px",
  lineHeight: "1.5"
};
var INPUT_STYLE = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "13px",
  fontFamily: "monospace",
  backgroundColor: "#313244",
  color: "#cdd6f4",
  border: "1px solid #585b70",
  borderRadius: "4px",
  outline: "none",
  boxSizing: "border-box"
};
var BUTTON_PRIMARY_STYLE = {
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#1e1e2e",
  backgroundColor: "#a6e3a1",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};
var BUTTON_SECONDARY_STYLE = {
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#cdd6f4",
  backgroundColor: "transparent",
  border: "1px solid #585b70",
  borderRadius: "4px",
  cursor: "pointer"
};
function parseCustomHeaders(raw) {
  const headers = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) continue;
    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  }
  return headers;
}
function DevToolsSetupPopup(props) {
  const {
    configEndpoint = "/api/devtools/config",
    onSaved,
    onDismiss,
    className,
    style
  } = props;
  const probeDetected = useDevToolsProbe();
  const [state, setState] = (0, import_react.useState)({
    apiKey: "",
    customHeadersRaw: "",
    saving: false,
    error: null,
    success: false
  });
  const handleSubmit = (0, import_react.useCallback)(
    async (e) => {
      e.preventDefault();
      if (!state.apiKey.trim()) {
        setState((s) => ({ ...s, error: "API key is required" }));
        return;
      }
      setState((s) => ({ ...s, saving: true, error: null }));
      try {
        const customHeaders = parseCustomHeaders(state.customHeadersRaw);
        const response = await fetch(configEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: state.apiKey.trim(), customHeaders })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Server responded with ${response.status}`);
        }
        deleteCookie(DEVTOOLS_PROBE_COOKIE);
        setState((s) => ({ ...s, saving: false, success: true }));
        onSaved?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save configuration";
        setState((s) => ({ ...s, saving: false, error: message }));
      }
    },
    [state.apiKey, state.customHeadersRaw, configEndpoint, onSaved]
  );
  const handleDismiss = (0, import_react.useCallback)(() => {
    deleteCookie(DEVTOOLS_PROBE_COOKIE);
    setState((s) => ({ ...s, success: false }));
    onDismiss?.();
  }, [onDismiss]);
  if (!probeDetected) {
    return null;
  }
  if (state.success) {
    const containerStyle2 = style === false ? void 0 : { ...style ?? DEFAULT_POPUP_STYLE };
    return (0, import_react.createElement)(
      "div",
      { className, style: containerStyle2, "data-devtools-popup": "success" },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" } },
        (0, import_react.createElement)("span", { style: { fontSize: "18px" } }, "\u2705"),
        (0, import_react.createElement)("strong", null, "DevTools SSR Debug Active")
      ),
      (0, import_react.createElement)(
        "p",
        { style: { margin: "0 0 12px", opacity: 0.8 } },
        "Configuration saved. SSR requests will now include debug headers."
      ),
      (0, import_react.createElement)(
        "button",
        {
          type: "button",
          onClick: handleDismiss,
          style: BUTTON_SECONDARY_STYLE
        },
        "Dismiss"
      )
    );
  }
  const containerStyle = style === false ? void 0 : { ...style ?? DEFAULT_POPUP_STYLE };
  return (0, import_react.createElement)(
    "div",
    { className, style: containerStyle, "data-devtools-popup": "config" },
    // Title
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
      (0, import_react.createElement)("strong", { style: { fontSize: "14px" } }, "DevTools SSR Setup"),
      (0, import_react.createElement)(
        "button",
        {
          type: "button",
          onClick: handleDismiss,
          style: { background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: "18px", padding: "0", lineHeight: "1" },
          "aria-label": "Close"
        },
        "\xD7"
      )
    ),
    (0, import_react.createElement)(
      "p",
      { style: { margin: "0 0 12px", opacity: 0.7, fontSize: "12px" } },
      "Chrome extension detected debug mode. Enter your Magento profiler API key to enable SSR request tracing."
    ),
    // Form
    (0, import_react.createElement)(
      "form",
      { onSubmit: handleSubmit },
      // API Key field
      (0, import_react.createElement)(
        "div",
        { style: { marginBottom: "10px" } },
        (0, import_react.createElement)(
          "label",
          { style: { display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "12px" } },
          "API Key"
        ),
        (0, import_react.createElement)("input", {
          type: "password",
          value: state.apiKey,
          onChange: (e) => setState((s) => ({ ...s, apiKey: e.target.value, error: null })),
          placeholder: "Enter your debug API key",
          style: INPUT_STYLE,
          autoComplete: "off",
          required: true
        })
      ),
      // Custom Headers field
      (0, import_react.createElement)(
        "div",
        { style: { marginBottom: "12px" } },
        (0, import_react.createElement)(
          "label",
          { style: { display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "12px" } },
          "Custom Headers ",
          (0, import_react.createElement)("span", { style: { fontWeight: 400, opacity: 0.6 } }, "(optional)")
        ),
        (0, import_react.createElement)("textarea", {
          value: state.customHeadersRaw,
          onChange: (e) => setState((s) => ({ ...s, customHeadersRaw: e.target.value })),
          placeholder: "X-Custom-Header: value\nX-Another: value",
          rows: 3,
          style: { ...INPUT_STYLE, resize: "vertical", minHeight: "60px" }
        })
      ),
      // Error message
      state.error ? (0, import_react.createElement)(
        "div",
        { style: { marginBottom: "10px", color: "#f38ba8", fontSize: "12px" } },
        state.error
      ) : null,
      // Action buttons
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
        (0, import_react.createElement)(
          "button",
          {
            type: "button",
            onClick: handleDismiss,
            style: BUTTON_SECONDARY_STYLE
          },
          "Cancel"
        ),
        (0, import_react.createElement)(
          "button",
          {
            type: "submit",
            disabled: state.saving,
            style: {
              ...BUTTON_PRIMARY_STYLE,
              opacity: state.saving ? 0.6 : 1,
              cursor: state.saving ? "wait" : "pointer"
            }
          },
          state.saving ? "Saving..." : "Save & Enable"
        )
      )
    )
  );
}

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
var fetchPatched = false;
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
function register() {
  debugLog("register() called");
  patchFetch();
  if (typeof require !== "undefined") {
    try {
      const axiosModule = require("axios");
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

// src/index.ts
init_ssr_correlation();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS,
  CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS,
  DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE,
  DEVTOOLS_CONFIG_TTL,
  DEVTOOLS_PROBE_COOKIE,
  DEVTOOLS_PROBE_TTL,
  DEVTOOLS_SSR_ID_COOKIE,
  DevToolsSetupPopup,
  ReactSsrDebugContext,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER,
  attachSsrIdToNextResponse,
  bindDevtoolsSsrCorrelation,
  buildDebugHeaders,
  createDebugFetch,
  createDevToolsConfigHandler,
  createNextSsrContext,
  createReactSsrDebugValue,
  createSsrContextFromCookies,
  createSsrId,
  deserializeDevToolsConfig,
  devtoolsSsrCorrelationMiddleware,
  forwardDevtoolsSsrRequestToServer,
  getAutoDebugFetch,
  getDebugHeaders,
  handleDevToolsProbe,
  hasDevToolsProbe,
  isValidForwardedSsrId,
  mergeHeaders,
  patchAxios,
  patchAxiosCreate,
  patchAxiosDefault,
  patchFetch,
  pinSsrIdForRequest,
  prepareDevtoolsSsrRequest,
  readDevToolsConfig,
  readSsrIdFromAppRouterHeaders,
  register,
  resolveDebugApiKey,
  serializeDevToolsConfig,
  setSsrIdOnMiddlewareResponse,
  shouldAllocateNewDevtoolsSsrId,
  shouldSkipDevtoolsSsrCorrelation,
  useDevToolsProbe,
  useSsrId,
  withDevToolsHeaders,
  withDevtoolsSsrBridge
});
