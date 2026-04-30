/**
 * @module instrument
 *
 * - **`register()`** — patches `globalThis.fetch` for Magento URLs.
 * - **`patchAxios(instance)`** — request interceptor; call from your app for
 *   each `axios` / `axios.create()` instance (required when webpack bundles
 *   axios; see `@bitbabit/devtools-ssr-bridge/attach-axios`).
 *
 * Config: `__devtools_config` cookie, or `MAGENTO_DEVTOOLS_ENABLED` +
 * `MAGENTO_DEVTOOLS_API_KEY`.
 *
 * **Do not** use a static `import` from `node:module` here — Next’s bundler
 * would try to resolve `module` in the ESM graph. Use runtime `require` only
 * (CJS / tsup `__require`); package `exports` map `node` → `.cjs` for this entry.
 *
 * ```ts
 * // instrumentation.js
 * export { register } from '@bitbabit/devtools-ssr-bridge/instrument';
 * ```
 */

import {
  type DevToolsConfig,
  createSsrId,
  DEBUG_API_KEY_HEADER,
  DEBUG_MODE_HEADER,
  DEVTOOLS_CONFIG_COOKIE,
  deserializeDevToolsConfig,
  isValidForwardedSsrId,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER,
  SSR_SOURCE_HEADER
} from './core';

const DEFAULT_ALLOWED_PATHS = ['/graphql', '/rest/V', '/rest/all/V', '/api/'];
const BLOCKED_HEADER_NAMES = new Set([
  'host',
  'cookie',
  'set-cookie',
  'content-length',
  'transfer-encoding',
  'connection',
  'proxy-authorization',
  'proxy-authenticate'
]);

let fetchPatched = false;

const requestScopedSsrIds = new WeakMap<object, string>();
const BRIDGE_DEBUG_ENABLED = process.env.DEVTOOLS_SSR_BRIDGE_DEBUG === '1';

/**
 * Runtime `require` only — avoids pulling `node:module` into the ESM bundle.
 * Next should resolve the `node` export (`.cjs`) for instrumentation.
 */
function safeRequire(id: string): unknown {
  if (typeof require !== 'undefined') {
    return (require as NodeJS.Require)(id);
  }
  throw new Error(
    `devtools-ssr-bridge: cannot load "${id}" — no CommonJS require in this bundle. ` +
      'Use the CJS build: package exports `"node": "./dist/instrument.cjs"` for `./instrument`.'
  );
}

async function normalizeDynamicApiResult<T>(result: T | Promise<T>): Promise<T> {
  return await Promise.resolve(result);
}

async function establishRequestContextForDynamicApis(): Promise<void> {
  try {
    const mod = safeRequire('next/server') as { connection?: () => unknown };
    if (typeof mod.connection === 'function') {
      await normalizeDynamicApiResult(mod.connection());
    }
  } catch {
    // outside Next / older Next without connection()
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function register(): void {
  debugLog('register() called');
  patchFetch();
}

export function patchFetch(): void {
  if (fetchPatched) {
    debugLog('patchFetch skipped: already patched');
    return;
  }

  const originalFetch = globalThis.fetch;
  fetchPatched = true;

  globalThis.fetch = async function devToolsPatchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = extractUrl(input);
    debugLog('fetch intercepted', { url });

    if (!url) {
      return originalFetch(input, init);
    }

    const context = await readRequestContext();
    const cfg = context?.config;

    if (!cfg || !cfg.enabled) {
      debugLog('fetch skipped: bridge config missing or disabled', { url });
      return originalFetch(input, init);
    }

    if (!shouldInjectHeaders(url, cfg)) {
      debugLog('fetch skipped: URL did not match allowed paths', { url });
      return originalFetch(input, init);
    }

    const ssrId = getOrCreateSsrId(context?.requestScopeKey, context?.forwardedSsrId ?? null);
    const debugHeaders = buildHeaders(cfg, ssrId);
    const mergedInit = mergeInit(init, debugHeaders);
    debugLog('fetch injecting debug headers', { url, ssrId });

    return originalFetch(input, mergedInit);
  };
}

/**
 * @deprecated No longer installs anything. Use `attachAxiosSsrDevtools` from
 * `@bitbabit/devtools-ssr-bridge/attach-axios` (or `patchAxios` per instance).
 */
export function patchAxiosDefault(): void {
  // Intentionally empty — webpack-bundled axios is not reachable via Module._load.
}

export function patchAxios(axiosInstance: AxiosLike): number {
  return axiosInstance.interceptors.request.use(
    async (requestConfig: AxiosRequestConfig) => {
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
      debugLog('axios interceptor injecting', { url, ssrId });
      return requestConfig;
    }
  );
}

export async function getDebugHeaders(url: string): Promise<Record<string, string> | null> {
  const context = await readRequestContext();
  const cfg = context?.config;
  if (!cfg || !cfg.enabled) return null;
  if (!shouldInjectHeaders(url, cfg)) return null;
  const ssrId = getOrCreateSsrId(context?.requestScopeKey, context?.forwardedSsrId ?? null);
  return buildHeaders(cfg, ssrId);
}

// ---------------------------------------------------------------------------
// Axios types (duck-typed)
// ---------------------------------------------------------------------------

interface AxiosRequestConfig {
  url?: string;
  baseURL?: string;
  headers?: Record<string, unknown>;
}

interface AxiosLike {
  interceptors: {
    request: {
      use(
        onFulfilled: (
          config: AxiosRequestConfig
        ) => AxiosRequestConfig | Promise<AxiosRequestConfig>
      ): number;
    };
  };
}

// ---------------------------------------------------------------------------
// Internals — fetch + context
// ---------------------------------------------------------------------------

function extractUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === 'object' && 'url' in input) return input.url;
  return null;
}

function resolveAxiosUrl(config: AxiosRequestConfig): string | null {
  const base = config.baseURL ?? '';
  const path = config.url ?? '';
  if (!base && !path) return null;
  if (base && path) {
    try {
      return new URL(path, base).href;
    } catch {
      return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
    }
  }
  return base || path || null;
}

async function readRequestContext(): Promise<{
  config: DevToolsConfig;
  requestScopeKey: object | undefined;
  forwardedSsrId: string | null;
} | null> {
  try {
    await establishRequestContextForDynamicApis();
    const { cookies: cookiesFn } = safeRequire('next/headers') as { cookies: () => unknown };
    const cookieStore: unknown = await normalizeDynamicApiResult(cookiesFn());

    if (!cookieStore || typeof cookieStore !== 'object' || typeof (cookieStore as { get?: unknown }).get !== 'function') {
      return await tryEnvFallbackContext();
    }

    const raw = (cookieStore as { get: (name: string) => { value: string } | undefined })
      .get(DEVTOOLS_CONFIG_COOKIE)?.value;
    const config = deserializeDevToolsConfig(raw);
    if (!config) {
      return await tryEnvFallbackContext();
    }

    const forwardedSsrId = await readForwardedSsrIdFromHeaders();
    return { config, requestScopeKey: cookieStore as object, forwardedSsrId };
  } catch {
    debugLog('readRequestContext: outside next request context');
  }

  return await tryEnvFallbackContext();
}

async function tryEnvFallbackContext(): Promise<{
  config: DevToolsConfig;
  requestScopeKey: object | undefined;
  forwardedSsrId: string | null;
} | null> {
  if (process.env.MAGENTO_DEVTOOLS_ENABLED !== 'true') {
    return null;
  }

  const apiKey = process.env.MAGENTO_DEVTOOLS_API_KEY ?? '';
  const config: DevToolsConfig = {
    enabled: true,
    apiKey,
    customHeaders: {},
    allowedPaths: [],
    createdAt: Date.now()
  };
  const forwardedSsrId = await readForwardedSsrIdFromHeaders();
  return { config, requestScopeKey: undefined, forwardedSsrId };
}

async function readForwardedSsrIdFromHeaders(): Promise<string | null> {
  try {
    await establishRequestContextForDynamicApis();
    const { headers: headersFn } = safeRequire('next/headers') as { headers: () => unknown };
    const store: unknown = await normalizeDynamicApiResult(headersFn());
    if (!store || typeof store !== 'object' || typeof (store as { get?: unknown }).get !== 'function') {
      return null;
    }
    const raw = (store as { get: (name: string) => string | null | undefined }).get(SSR_ID_REQUEST_HEADER);
    if (raw && isValidForwardedSsrId(raw)) {
      return raw;
    }
  } catch {
    // ignore
  }
  return null;
}

function shouldInjectHeaders(url: string, config: DevToolsConfig): boolean {
  const paths =
    config.allowedPaths && config.allowedPaths.length > 0 ? config.allowedPaths : DEFAULT_ALLOWED_PATHS;
  const requestPathname = getPathname(url);
  if (!requestPathname) return false;
  return paths.some((path) => requestPathname.startsWith(path));
}

function getOrCreateSsrId(requestScopeKey: object | undefined, forwardedSsrId: string | null): string {
  if (requestScopeKey && requestScopedSsrIds.has(requestScopeKey)) {
    return requestScopedSsrIds.get(requestScopeKey)!;
  }

  const id =
    forwardedSsrId && isValidForwardedSsrId(forwardedSsrId) ? forwardedSsrId : createSsrId();
  if (requestScopeKey) {
    requestScopedSsrIds.set(requestScopeKey, id);
  }
  return id;
}

function buildHeaders(config: DevToolsConfig, ssrId: string): Record<string, string> {
  const headers: Record<string, string> = {
    [DEBUG_MODE_HEADER]: 'true',
    [SSR_ID_HEADER]: ssrId,
    [SSR_SOURCE_HEADER]: 'nextjs'
  };

  if (config.apiKey) {
    headers[DEBUG_API_KEY_HEADER] = config.apiKey;
  }

  const safeCustomHeaders = sanitizeCustomHeaders(config.customHeaders ?? {});
  Object.assign(headers, safeCustomHeaders);

  return headers;
}

function sanitizeCustomHeaders(customHeaders: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

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

function getPathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    if (!url.startsWith('/')) return null;
    return url;
  }
}

function mergeInit(init: RequestInit | undefined, debugHeaders: Record<string, string>): RequestInit {
  const merged = new Headers(init?.headers ?? {});

  for (const [key, value] of Object.entries(debugHeaders)) {
    if (!merged.has(key)) {
      merged.set(key, value);
    }
  }

  return { ...init, headers: merged };
}

function debugLog(message: string, meta?: Record<string, unknown>): void {
  if (!BRIDGE_DEBUG_ENABLED) {
    return;
  }
  if (meta) {
    console.log(`[devtools-ssr-bridge] ${message}`, meta);
    return;
  }
  console.log(`[devtools-ssr-bridge] ${message}`);
}
