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

// src/next-app-route.ts
var next_app_route_exports = {};
__export(next_app_route_exports, {
  DELETE: () => DELETE,
  POST: () => POST
});
module.exports = __toCommonJS(next_app_route_exports);

// src/core.ts
var DEVTOOLS_PROBE_COOKIE = "__devtools_probe";
var DEVTOOLS_CONFIG_COOKIE = "__devtools_config";
var DEVTOOLS_CONFIG_TTL = 6 * 60 * 60;
function serializeDevToolsConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

// src/next.ts
function createDevToolsConfigHandler(options = {}) {
  const configTtl = options.configTtl ?? DEVTOOLS_CONFIG_TTL;
  async function POST2(request) {
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
  async function DELETE2() {
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
  return { POST: POST2, DELETE: DELETE2 };
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

// src/next-app-route.ts
var { POST, DELETE } = createDevToolsConfigHandler({
  configTtl: DEVTOOLS_CONFIG_TTL
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DELETE,
  POST
});
