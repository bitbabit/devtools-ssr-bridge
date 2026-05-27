import {
  DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE,
  DEVTOOLS_CONFIG_TTL,
  DEVTOOLS_PROBE_COOKIE,
  DEVTOOLS_PROBE_TTL,
  DEVTOOLS_SSR_ID_COOKIE,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER,
  createDebugFetch,
  createSsrId,
  deserializeDevToolsConfig,
  resolveDebugApiKey,
  serializeDevToolsConfig
} from "./chunk-DBLTRXN2.js";

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

export {
  createNextSsrContext,
  attachSsrIdToNextResponse,
  handleDevToolsProbe,
  shouldSkipDevtoolsSsrCorrelation,
  shouldAllocateNewDevtoolsSsrId,
  prepareDevtoolsSsrRequest,
  setSsrIdOnMiddlewareResponse,
  forwardDevtoolsSsrRequestToServer,
  devtoolsSsrCorrelationMiddleware,
  createDevToolsConfigHandler,
  readDevToolsConfig,
  hasDevToolsProbe,
  createSsrContextFromCookies,
  getAutoDebugFetch,
  withDevToolsHeaders,
  withDevtoolsSsrBridge
};
