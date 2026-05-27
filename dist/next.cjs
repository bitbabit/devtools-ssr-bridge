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

// src/next.ts
var next_exports = {};
__export(next_exports, {
  attachSsrIdToNextResponse: () => attachSsrIdToNextResponse,
  createDevToolsConfigHandler: () => createDevToolsConfigHandler,
  createNextSsrContext: () => createNextSsrContext,
  createSsrContextFromCookies: () => createSsrContextFromCookies,
  devtoolsSsrCorrelationMiddleware: () => devtoolsSsrCorrelationMiddleware,
  forwardDevtoolsSsrRequestToServer: () => forwardDevtoolsSsrRequestToServer,
  getAutoDebugFetch: () => getAutoDebugFetch,
  handleDevToolsProbe: () => handleDevToolsProbe,
  hasDevToolsProbe: () => hasDevToolsProbe,
  prepareDevtoolsSsrRequest: () => prepareDevtoolsSsrRequest,
  readDevToolsConfig: () => readDevToolsConfig,
  setSsrIdOnMiddlewareResponse: () => setSsrIdOnMiddlewareResponse,
  shouldAllocateNewDevtoolsSsrId: () => shouldAllocateNewDevtoolsSsrId,
  shouldSkipDevtoolsSsrCorrelation: () => shouldSkipDevtoolsSsrCorrelation,
  withDevToolsHeaders: () => withDevToolsHeaders,
  withDevtoolsSsrBridge: () => withDevtoolsSsrBridge
});
module.exports = __toCommonJS(next_exports);

// src/core.ts
var SSR_ID_HEADER = "X-SSR-ID";
var SSR_ID_REQUEST_HEADER = "x-devtools-ssr-id";
var DEBUG_MODE_HEADER = "X-Debug-Mode";
var DEBUG_API_KEY_HEADER = "X-Debug-Api-Key";
var SSR_SOURCE_HEADER = "X-SSR-Source";
var DEVTOOLS_PROBE_COOKIE = "__devtools_probe";
var DEVTOOLS_CONFIG_COOKIE = "__devtools_config";
var DEVTOOLS_SSR_ID_COOKIE = "__devtools_ssr_id";
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

// src/next.ts
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  attachSsrIdToNextResponse,
  createDevToolsConfigHandler,
  createNextSsrContext,
  createSsrContextFromCookies,
  devtoolsSsrCorrelationMiddleware,
  forwardDevtoolsSsrRequestToServer,
  getAutoDebugFetch,
  handleDevToolsProbe,
  hasDevToolsProbe,
  prepareDevtoolsSsrRequest,
  readDevToolsConfig,
  setSsrIdOnMiddlewareResponse,
  shouldAllocateNewDevtoolsSsrId,
  shouldSkipDevtoolsSsrCorrelation,
  withDevToolsHeaders,
  withDevtoolsSsrBridge
});
