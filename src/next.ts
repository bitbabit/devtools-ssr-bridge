import {
  type DebugFetch,
  type DevToolsConfig,
  createDebugFetch,
  createSsrId,
  DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE,
  DEVTOOLS_CONFIG_TTL,
  DEVTOOLS_PROBE_COOKIE,
  DEVTOOLS_PROBE_TTL,
  DEVTOOLS_SSR_ID_COOKIE,
  deserializeDevToolsConfig,
  isValidForwardedSsrId,
  resolveDebugApiKey,
  serializeDevToolsConfig,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER
} from './core';

// ============================================================================
// Section 1 — SSR Context Helpers
// ============================================================================

/** Configuration for Next.js SSR bridge context. */
export type NextBridgeConfig = {
  /** Optional API key (same semantics as extension popup `debugApiKey`). */
  apiKey?: string;
  /** Lazy API key from your existing server config — no env names required. */
  getApiKey?: () => string | undefined;
  /** Enables X-Debug-Mode when true. Defaults to `true`. */
  enabled?: boolean;
  /** Runtime/source value for `X-SSR-Source`. Defaults to `"nextjs"`. */
  source?: string;
  /** Arbitrary custom headers to forward on every Magento call. */
  customHeaders?: Record<string, string>;
};

/** Runtime context returned for one Next.js SSR request scope. */
export type NextSsrContext = {
  /** Stable SSR ID for this server-rendered request. */
  ssrId: string;
  /** Canonical headers that can be forwarded to Magento calls. */
  headers: Record<string, string>;
  /** Fetch wrapper that injects the SSR/debug headers. */
  debugFetch: DebugFetch;
};

/**
 * Creates an SSR context for a single Next.js request lifecycle.
 *
 * Call once per incoming request (e.g. in `getServerSideProps`,
 * a server component, or a route handler) and reuse the returned
 * `debugFetch` for every Magento call within that request scope.
 *
 * @param config - Optional bridge configuration.
 * @returns A request-scoped context with SSR ID, headers, and fetch wrapper.
 *
 * @example
 * ```ts
 * const ctx = createNextSsrContext({ apiKey: 'my-key' });
 * const res = await ctx.debugFetch('https://magento.test/graphql', {
 *   method: 'POST',
 *   body: JSON.stringify({ query: '{ storeConfig { ... } }' }),
 * });
 * ```
 */
export function createNextSsrContext(config: NextBridgeConfig = {}): NextSsrContext {
  const ssrId = createSsrId();
  const enabled = config.enabled ?? true;
  const source = config.source ?? 'nextjs';
  const apiKey = resolveDebugApiKey(config);

  const headers: Record<string, string> = {
    [SSR_ID_HEADER]: ssrId,
    [SSR_SOURCE_HEADER]: source
  };

  if (enabled) {
    headers[DEBUG_MODE_HEADER] = 'true';
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

/**
 * Propagates the SSR ID back to the browser via a response header so the
 * Chrome extension can discover it and fetch the corresponding SSR logs.
 *
 * @param response - Any object with a `headers.set()` method (e.g. `NextResponse`).
 * @param ssrId    - The SSR correlation ID.
 */
export function attachSsrIdToNextResponse(
  response: { headers: { set: (name: string, value: string) => void } },
  ssrId: string
): void {
  response.headers.set(SSR_ID_HEADER, ssrId);
}

// ============================================================================
// Section 2 — Middleware Helper (probe detection)
// ============================================================================

/**
 * Minimal duck-typed interfaces so we can work with Next.js `NextRequest`
 * and `NextResponse` without importing the `next` package directly.
 */
interface MiddlewareRequest {
  headers: { get(name: string): string | null };
}

interface MiddlewareResponse {
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): void;
  };
}

/** Options for {@link handleDevToolsProbe}. */
export interface DevToolsProbeOptions {
  /** Override the probe cookie TTL in seconds. Defaults to 300 (5 min). */
  probeTtl?: number;
}

/**
 * Detects the `X-Debug-Mode` header on an incoming request and sets the
 * short-lived `__devtools_probe` cookie so the React popup appears on
 * next page load.
 *
 * Call this inside your existing Next.js middleware — it is **not** a
 * standalone middleware function, so it composes cleanly with any other
 * middleware logic you already have.
 *
 * @param request  - The incoming `NextRequest` (or compatible object).
 * @param response - The outgoing `NextResponse` (or compatible object).
 * @param options  - Optional overrides.
 * @returns `true` if the probe header was present and the cookie was set.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { NextResponse } from 'next/server';
 * import type { NextRequest } from 'next/server';
 * import { handleDevToolsProbe } from '@bitbabit/devtools-ssr-bridge/next';
 *
 * export function middleware(request: NextRequest) {
 *   const response = NextResponse.next();
 *   handleDevToolsProbe(request, response);
 *   return response;
 * }
 * ```
 */
export function handleDevToolsProbe(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
  options: DevToolsProbeOptions = {}
): boolean {
  const debugMode = request.headers.get(DEBUG_MODE_HEADER);

  if (!debugMode) {
    return false;
  }

  const ttl = options.probeTtl ?? DEVTOOLS_PROBE_TTL;

  response.cookies.set(DEVTOOLS_PROBE_COOKIE, '1', {
    path: '/',
    maxAge: ttl,
    sameSite: 'lax',
    secure: false, // readable by client JS, no httpOnly
    httpOnly: false
  });

  return true;
}

/**
 * Duck-typed `NextRequest` for SSR correlation (avoids importing `next`).
 */
interface CorrelationMiddlewareRequest extends MiddlewareRequest {
  cookies: { get(name: string): { value: string } | undefined };
  headers: Headers;
}

/**
 * Duck-typed `NextResponse` static (pass `NextResponse` from `next/server`).
 */
interface CorrelationNextResponse {
  next: () => {
    headers: { set: (name: string, value: string) => void };
  };
}

/**
 * Paths that trigger extra middleware/SSR work but are not the storefront document.
 * Correlating them produces a second `X-SSR-ID` (e.g. Chrome `com.chrome.devtools.json`)
 * while the extension reads the id from the HTML response — ids then diverge from Magento.
 */
export function shouldSkipDevtoolsSsrCorrelation(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return (
    path.includes('com.chrome.devtools.json') ||
    path.includes('/.well-known/appspecific/')
  );
}

/** Only the storefront document should mint a brand-new SSR id when no cookie exists yet. */
export function shouldAllocateNewDevtoolsSsrId(pathname: string): boolean {
  if (!pathname || shouldSkipDevtoolsSsrCorrelation(pathname)) {
    return false;
  }
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return false;
  }
  return true;
}

function applySsrIdToMiddlewareRequest(
  request: CorrelationMiddlewareRequest,
  ssrId: string
): void {
  request.headers.set(SSR_ID_REQUEST_HEADER, ssrId);
  request.headers.set(SSR_ID_HEADER, ssrId);
}

/**
 * When `__devtools_config` is present, sets internal header `x-devtools-ssr-id`
 * on the **mutable** Edge `request` (same pattern as `request.headers.set('x-url', ...)`).
 * Returns the SSR id to echo on the response, or `null` if debug cookie is absent.
 *
 * Use this **before** `i18nRouter` / other logic, then call
 * `setSsrIdOnMiddlewareResponse(yourResponse, ssrId)` on whatever you return
 * (e.g. `I18nRes`).
 */
export function prepareDevtoolsSsrRequest(
  request: CorrelationMiddlewareRequest,
  options: { pathname?: string } = {}
): string | null {
  const pathname = options.pathname ?? '';
  if (pathname && shouldSkipDevtoolsSsrCorrelation(pathname)) {
    return null;
  }

  if (!request.cookies.get(DEVTOOLS_CONFIG_COOKIE)?.value?.trim()) {
    return null;
  }

  if (!shouldAllocateNewDevtoolsSsrId(pathname)) {
    return null;
  }

  // One fresh id per document request — do not reuse __devtools_ssr_id cookie across pages.
  const ssrId = createSsrId();
  applySsrIdToMiddlewareRequest(request, ssrId);
  return ssrId;
}

/**
 * Sets `X-SSR-ID` on the HTML response (what the Chrome extension reads).
 */
export function setSsrIdOnMiddlewareResponse(
  response: {
    headers: { set: (name: string, value: string) => void };
    cookies?: { set: (name: string, value: string, options?: Record<string, unknown>) => void };
  },
  ssrId: string | null
): void {
  if (!ssrId) {
    return;
  }

  response.headers.set(SSR_ID_HEADER, ssrId);

  // Clear legacy cookie that caused the same id to stick across page loads.
  if (response.cookies?.set) {
    response.cookies.set(DEVTOOLS_SSR_ID_COOKIE, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      httpOnly: true,
      secure: typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
    });
  }
}

interface MiddlewareResponseWithCookies {
  headers: {
    set: (name: string, value: string) => void;
    forEach?: (callback: (value: string, key: string) => void) => void;
  };
  cookies?: {
    getAll: () => Array<{
      name: string;
      value: string;
      path?: string;
      maxAge?: number;
      secure?: boolean;
      sameSite?: string | boolean;
      httpOnly?: boolean;
      domain?: string;
    }>;
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
  };
}

/**
 * Forwards `x-devtools-ssr-id` to the App Router server via
 * `NextResponse.next({ request: { headers } })`, then copies cookies/headers
 * from your existing middleware response (e.g. i18n).
 *
 * Required when middleware mutates `request.headers` — otherwise RSC/axios on
 * Node never see the id and each Magento call gets a new `X-SSR-ID`.
 */
export function forwardDevtoolsSsrRequestToServer<T extends MiddlewareResponseWithCookies>(
  request: CorrelationMiddlewareRequest,
  response: T,
  ssrId: string | null,
  NextResponse: {
    next: (init?: { request?: { headers: Headers } }) => T;
  }
): T {
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

  if (typeof response.headers.forEach === 'function') {
    response.headers.forEach((value, key) => {
      forwarded.headers.set(key, value);
    });
  }

  setSsrIdOnMiddlewareResponse(forwarded, ssrId);
  return forwarded;
}

/**
 * Adds **`X-SSR-ID`** on the response and **`x-devtools-ssr-id`** on the request
 * (only when `__devtools_config` exists). For apps that already mutate
 * `request` and return a custom `NextResponse`, use
 * `prepareDevtoolsSsrRequest` + `setSsrIdOnMiddlewareResponse` instead.
 *
 * @param request      - `NextRequest`
 * @param NextResponse - `NextResponse` from `next/server`
 * @returns `NextResponse.next()`
 */
export function devtoolsSsrCorrelationMiddleware(
  request: CorrelationMiddlewareRequest,
  NextResponse: CorrelationNextResponse & {
    next: (init?: { request?: { headers: Headers } }) => MiddlewareResponseWithCookies;
  }
): ReturnType<CorrelationNextResponse['next']> {
  const ssrId = prepareDevtoolsSsrRequest(request);
  if (!ssrId) {
    return NextResponse.next();
  }
  const response = NextResponse.next();
  return forwardDevtoolsSsrRequestToServer(request, response, ssrId, NextResponse);
}

// ============================================================================
// Section 3 — API Route Handler (config save / clear)
// ============================================================================

/** Options for {@link createDevToolsConfigHandler}. */
export interface DevToolsConfigHandlerOptions {
  /** Override the config cookie TTL in seconds. Defaults to {@link DEVTOOLS_CONFIG_TTL} (6 hours). */
  configTtl?: number;
  /**
   * Optional server-side validation for the submitted API key.
   * Return `true` to accept, `false` to reject with 403.
   */
  validateApiKey?: (apiKey: string) => boolean | Promise<boolean>;
}

/**
 * Shape of the JSON body expected by the config handler's `POST` method.
 *
 * Sent from the `<DevToolsSetupPopup />` component.
 */
interface ConfigRequestBody {
  apiKey: string;
  customHeaders?: Record<string, string>;
  allowedPaths?: string[];
}

/**
 * Creates a Next.js App Router–compatible route handler that accepts debug
 * configuration from the client-side popup and stores it in a secure
 * `httpOnly` cookie.
 *
 * Wire this to `POST /api/devtools/config` (or any path you prefer) and
 * point the `<DevToolsSetupPopup />` component at the same path.
 *
 * **Supported HTTP methods:**
 * - `POST`   — saves the config to an httpOnly cookie.
 * - `DELETE` — clears both the config and probe cookies.
 *
 * @param options - Optional overrides for TTL and validation.
 * @returns An object with `POST` and `DELETE` handler functions.
 *
 * @example
 * ```ts
 * // app/api/devtools/config/route.ts
 * import { createDevToolsConfigHandler } from '@bitbabit/devtools-ssr-bridge/next';
 *
 * export const { POST, DELETE } = createDevToolsConfigHandler();
 * ```
 */
export function createDevToolsConfigHandler(options: DevToolsConfigHandlerOptions = {}) {
  const configTtl = options.configTtl ?? DEVTOOLS_CONFIG_TTL;

  /**
   * Saves debug configuration to a secure httpOnly cookie and clears the
   * probe cookie (the popup is no longer needed after saving).
   */
  async function POST(request: Request): Promise<Response> {
    let body: ConfigRequestBody;

    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.apiKey || typeof body.apiKey !== 'string' || !body.apiKey.trim()) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (options.validateApiKey) {
      const valid = await options.validateApiKey(body.apiKey.trim());
      if (!valid) {
        return new Response(
          JSON.stringify({ error: 'API key validation failed' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const config: DevToolsConfig = {
      enabled: true,
      apiKey: body.apiKey.trim(),
      customHeaders: sanitizeHeaders(body.customHeaders ?? {}),
      allowedPaths: sanitizeAllowedPaths(body.allowedPaths),
      createdAt: Date.now()
    };

    const serialized = serializeDevToolsConfig(config);
    const headers = new Headers({ 'Content-Type': 'application/json' });

    const isSecure = typeof process !== 'undefined'
      ? process.env.NODE_ENV === 'production'
      : true;

    headers.append(
      'Set-Cookie',
      buildCookieString(DEVTOOLS_CONFIG_COOKIE, serialized, {
        path: '/',
        maxAge: configTtl,
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Lax'
      })
    );

    headers.append(
      'Set-Cookie',
      buildCookieString(DEVTOOLS_PROBE_COOKIE, '', {
        path: '/',
        maxAge: 0,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      })
    );

    return new Response(
      JSON.stringify({ success: true, ttl: configTtl }),
      { status: 200, headers }
    );
  }

  /**
   * Clears both devtools cookies, effectively disabling SSR debug mode.
   */
  async function DELETE(): Promise<Response> {
    const isSecure = typeof process !== 'undefined'
      ? process.env.NODE_ENV === 'production'
      : true;

    const headers = new Headers({ 'Content-Type': 'application/json' });

    headers.append(
      'Set-Cookie',
      buildCookieString(DEVTOOLS_CONFIG_COOKIE, '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Lax'
      })
    );

    headers.append(
      'Set-Cookie',
      buildCookieString(DEVTOOLS_PROBE_COOKIE, '', {
        path: '/',
        maxAge: 0,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      })
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  }

  return { POST, DELETE };
}

// ============================================================================
// Section 4 — Cookie Reader (server-side config extraction)
// ============================================================================

/**
 * Duck-typed cookie accessor. Matches the shape returned by
 * `cookies()` from `next/headers` as well as plain `Map`-like objects.
 */
interface CookieStore {
  get(name: string): { value: string } | undefined;
}

/**
 * Reads and deserializes the `__devtools_config` httpOnly cookie into a
 * {@link DevToolsConfig} object.
 *
 * Use this in server components, `getServerSideProps`, or route handlers
 * to obtain the config that was previously stored by the popup.
 *
 * @param cookies - A cookie store (e.g. `cookies()` from `next/headers`).
 * @returns The parsed config, or `null` if absent / expired / malformed.
 *
 * @example
 * ```ts
 * // app/page.tsx (server component)
 * import { cookies } from 'next/headers';
 * import { readDevToolsConfig, createNextSsrContext } from '@bitbabit/devtools-ssr-bridge/next';
 *
 * export default async function Page() {
 *   const config = readDevToolsConfig(cookies());
 *
 *   if (config) {
 *     const ctx = createNextSsrContext({
 *       apiKey: config.apiKey,
 *       customHeaders: config.customHeaders,
 *     });
 *     const data = await ctx.debugFetch('https://magento.test/graphql', { ... });
 *   }
 * }
 * ```
 */
export function readDevToolsConfig(cookies: CookieStore): DevToolsConfig | null {
  const raw = cookies.get(DEVTOOLS_CONFIG_COOKIE)?.value;
  return deserializeDevToolsConfig(raw);
}

/**
 * Checks whether the probe cookie is present, indicating the Chrome
 * extension has sent the initial debug signal.
 *
 * @param cookies - A cookie store.
 * @returns `true` if the probe cookie exists.
 */
export function hasDevToolsProbe(cookies: CookieStore): boolean {
  return cookies.get(DEVTOOLS_PROBE_COOKIE)?.value === '1';
}

/**
 * Convenience factory that reads the config cookie and — if debug mode is
 * active — creates a fully-configured {@link NextSsrContext} ready for use.
 *
 * Returns `null` when no valid config cookie is present, so callers can
 * fall back to a regular (non-debug) fetch.
 *
 * @param cookies - A cookie store (e.g. `cookies()` from `next/headers`).
 * @param overrides - Additional {@link NextBridgeConfig} overrides.
 * @returns A request-scoped SSR context, or `null`.
 *
 * @example
 * ```ts
 * const ctx = createSsrContextFromCookies(cookies());
 * const fetcher = ctx?.debugFetch ?? fetch;
 * ```
 */
export function createSsrContextFromCookies(
  cookies: CookieStore,
  overrides: Partial<NextBridgeConfig> = {}
): NextSsrContext | null {
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

// ============================================================================
// Section 5 — Zero-Config Auto Fetch (cookie-driven, no manual wiring)
// ============================================================================

/**
 * Creates a debug-aware fetch wrapper by reading the `__devtools_config`
 * cookie that the Chrome extension's content script sets automatically.
 *
 * When the extension is active, every SSR fetch call through this wrapper
 * includes `X-Debug-Mode`, `X-Debug-Api-Key`, `X-SSR-ID`, and any custom
 * headers — **without any middleware, API routes, or popup components**.
 *
 * When the extension is inactive (no cookie), this returns plain `fetch`
 * with zero overhead.
 *
 * @param cookies   - A cookie store (e.g. `cookies()` from `next/headers`).
 * @param overrides - Optional {@link NextBridgeConfig} overrides.
 * @returns An object with `fetch` (the wrapper) and `ssrId` (the
 *          correlation ID, or `null` if debug mode is off).
 *
 * @example
 * ```ts
 * // lib/magento.ts — your existing Magento fetch utility
 * import { cookies } from 'next/headers';
 * import { getAutoDebugFetch } from '@bitbabit/devtools-ssr-bridge/next';
 *
 * export async function magentoGraphql(query: string, variables?: object) {
 *   const { fetch: debugFetch, ssrId } = getAutoDebugFetch(cookies());
 *
 *   const res = await debugFetch('https://magento.test/graphql', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ query, variables }),
 *   });
 *
 *   return { data: await res.json(), ssrId };
 * }
 * ```
 */
export function getAutoDebugFetch(
  cookies: CookieStore,
  overrides: Partial<NextBridgeConfig> = {}
): { fetch: typeof globalThis.fetch | DebugFetch; ssrId: string | null } {
  const ctx = createSsrContextFromCookies(cookies, overrides);

  if (!ctx) {
    return { fetch: globalThis.fetch, ssrId: null };
  }

  return { fetch: ctx.debugFetch, ssrId: ctx.ssrId };
}

/**
 * Enriches an existing `RequestInit` (or plain headers object) with debug
 * headers from the cookie config. Useful when you don't want a fetch
 * wrapper but still want auto-injection.
 *
 * Returns the original init unchanged when the extension is inactive.
 *
 * @param cookies - A cookie store.
 * @param init    - Existing `RequestInit` to enrich.
 * @returns The enriched `RequestInit`.
 *
 * @example
 * ```ts
 * import { cookies } from 'next/headers';
 * import { withDevToolsHeaders } from '@bitbabit/devtools-ssr-bridge/next';
 *
 * const init = withDevToolsHeaders(cookies(), {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ query }),
 * });
 *
 * const res = await fetch('https://magento.test/graphql', init);
 * ```
 */
export function withDevToolsHeaders(
  cookies: CookieStore,
  init: RequestInit = {}
): RequestInit {
  const config = readDevToolsConfig(cookies);

  if (!config || !config.enabled) {
    return init;
  }

  const ssrId = createSsrId();
  const apiKey = config.apiKey;
  const source = 'nextjs';

  const debugHeaders: Record<string, string> = {
    [DEBUG_MODE_HEADER]: 'true',
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

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Builds a raw `Set-Cookie` header string.
 *
 * @param name    - Cookie name.
 * @param value   - Cookie value.
 * @param options - Cookie attributes.
 * @returns Formatted `Set-Cookie` string.
 */
function buildCookieString(
  name: string,
  value: string,
  options: {
    path?: string;
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }
): string {
  const parts = [`${name}=${value}`];

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join('; ');
}

/**
 * Strips empty-string values and trims header keys/values to prevent
 * accidental whitespace injection.
 *
 * @param headers - Raw headers object from the client.
 * @returns Cleaned headers.
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();

    if (trimmedKey && trimmedValue) {
      result[trimmedKey] = trimmedValue;
    }
  }

  return result;
}

function sanitizeAllowedPaths(paths: string[] | undefined): string[] {
  if (!Array.isArray(paths)) {
    return ['/graphql', '/rest/V', '/api/'];
  }

  const sanitized = paths
    .map((path) => path.trim())
    .filter((path) => path.startsWith('/'));

  return sanitized.length > 0 ? sanitized.slice(0, 32) : ['/graphql', '/rest/V', '/api/'];
}

// ============================================================================
// Next.js config — server must use Node `axios` so instrumentation can patch
// `Axios.prototype` (no per-app axios interceptors required).
// ============================================================================

export type NextConfigWithExperimental = Record<string, unknown> & {
  experimental?: Record<string, unknown>;
  webpack?: (
    config: Record<string, unknown>,
    context: { isServer: boolean; nextRuntime?: 'nodejs' | 'edge' }
  ) => Record<string, unknown>;
};

/**
 * Wrap your Next config. Merges `serverComponentsExternalPackages` / `serverExternalPackages`
 * and marks `axios` as a server external so SSR uses one Node copy.
 *
 * ```js
 * import { withDevtoolsSsrBridge } from '@bitbabit/devtools-ssr-bridge/next';
 * export default withDevtoolsSsrBridge({ ...nextConfig });
 * ```
 */
export function withDevtoolsSsrBridge(nextConfig: NextConfigWithExperimental = {}): NextConfigWithExperimental {
  const experimental =
    typeof nextConfig.experimental === 'object' && nextConfig.experimental !== null
      ? { ...nextConfig.experimental }
      : {};

  const modernKey = 'serverExternalPackages' as const;
  const legacyKey = 'serverComponentsExternalPackages' as const;
  const activeKey = modernKey in experimental ? modernKey : legacyKey;

  const existing: string[] = Array.isArray(experimental[activeKey])
    ? [...(experimental[activeKey] as string[])]
    : [];

  if (!existing.includes('axios')) {
    existing.unshift('axios');
  }
  if (!existing.includes('@bitbabit/devtools-ssr-bridge')) {
    existing.push('@bitbabit/devtools-ssr-bridge');
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
      let out = config as Record<string, unknown>;
      if (typeof userWebpack === 'function') {
        out = userWebpack(out, context) as Record<string, unknown>;
      }

      const isNodeServer = context.isServer && context.nextRuntime !== 'edge';
      if (!isNodeServer) {
        return out;
      }

      const prev = out.externals;
      const markAxiosExternal = (
        data: { request?: string },
        callback: (err?: Error | null, result?: string) => void
      ): void => {
        if (data.request === 'axios') {
          callback(null, 'commonjs axios');
          return;
        }
        callback();
      };

      if (Array.isArray(prev)) {
        out.externals = [...prev, markAxiosExternal];
      } else if (typeof prev === 'function') {
        out.externals = [prev, markAxiosExternal];
      } else if (prev !== undefined && prev !== null) {
        out.externals = [prev, markAxiosExternal];
      } else {
        out.externals = [markAxiosExternal];
      }

      return out;
    }
  };
}
