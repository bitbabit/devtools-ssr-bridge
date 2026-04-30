// ---------------------------------------------------------------------------
// Header constants — must match Chrome extension and Magento module expectations
// ---------------------------------------------------------------------------

/** Header used to correlate Magento SSR/internal logs. */
export const SSR_ID_HEADER = 'X-SSR-ID';
/**
 * Internal request header set by Next.js middleware so the document response
 * and outbound Magento fetches share the same SSR ID.
 */
export const SSR_ID_REQUEST_HEADER = 'x-devtools-ssr-id';
/** Header that enables profiler mode on the backend. */
export const DEBUG_MODE_HEADER = 'X-Debug-Mode';
/** Header used to authenticate debug/profiler requests. */
export const DEBUG_API_KEY_HEADER = 'X-Debug-Api-Key';
/** Header that describes runtime/source (e.g. nextjs, react-ssr). */
export const SSR_SOURCE_HEADER = 'X-SSR-Source';

// ---------------------------------------------------------------------------
// Cookie constants — shared between middleware, API handler, and React popup
// ---------------------------------------------------------------------------

/**
 * Short-lived, client-readable cookie set by middleware when `X-Debug-Mode`
 * header is detected on the incoming document request. Tells the React
 * popup component to show the configuration form.
 */
export const DEVTOOLS_PROBE_COOKIE = '__devtools_probe';

/**
 * httpOnly cookie that stores the full debug configuration (API key,
 * custom headers, enabled flag). Only readable on the server; the React
 * popup writes it via the config API route.
 */
export const DEVTOOLS_CONFIG_COOKIE = '__devtools_config';

/** Default TTL for the probe cookie in seconds (5 minutes). */
export const DEVTOOLS_PROBE_TTL = 300;

/** Default TTL for the config cookie in seconds (6 hours; aligned with Chrome extension). */
export const DEVTOOLS_CONFIG_TTL = 6 * 60 * 60;

/** Maximum accepted API key length from cookie payload. */
const MAX_API_KEY_LENGTH = 512;
/** Maximum accepted custom header entries from cookie payload. */
const MAX_CUSTOM_HEADER_COUNT = 32;
/** Maximum accepted allowed-path entries from cookie payload. */
const MAX_ALLOWED_PATH_COUNT = 32;
/** Header-name validation token (RFC 7230 token chars). */
const HEADER_NAME_TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// ---------------------------------------------------------------------------
// Persisted config shape (stored in the httpOnly cookie as JSON)
// ---------------------------------------------------------------------------

/** Debug configuration persisted in the cookie by the Chrome extension. */
export interface DevToolsConfig {
  /** Whether debug mode is active. */
  enabled: boolean;
  /** API key matching the Chrome extension popup `debugApiKey`. */
  apiKey: string;
  /** Arbitrary custom headers to forward on SSR Magento calls. */
  customHeaders: Record<string, string>;
  /**
   * URL path segments that identify Magento requests (e.g. `/graphql`, `/rest/V`).
   * Copied from the extension's `allowedPaths` setting so the fetch patch
   * knows which outgoing requests should receive debug headers.
   */
  allowedPaths: string[];
  /** Unix timestamp (ms) when the config was saved. */
  createdAt: number;
}

/**
 * Serializes a {@link DevToolsConfig} for safe cookie storage.
 *
 * @param config - The config object to serialize.
 * @returns URL-safe encoded JSON string.
 */
export function serializeDevToolsConfig(config: DevToolsConfig): string {
  return encodeURIComponent(JSON.stringify(config));
}

/**
 * Deserializes a cookie value back into a {@link DevToolsConfig}.
 *
 * @param raw - The raw cookie string value.
 * @returns Parsed config or `null` on failure.
 */
export function deserializeDevToolsConfig(raw: string | undefined | null): DevToolsConfig | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!isObject(parsed) || typeof parsed.enabled !== 'boolean') {
      return null;
    }

    const apiKey = typeof parsed.apiKey === 'string'
      ? parsed.apiKey.trim().slice(0, MAX_API_KEY_LENGTH)
      : '';

    const customHeaders = normalizeCustomHeaders(parsed.customHeaders);
    const allowedPaths = normalizeAllowedPaths(parsed.allowedPaths);
    const createdAt = typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
      ? parsed.createdAt
      : Date.now();

    return {
      enabled: parsed.enabled,
      apiKey,
      customHeaders,
      allowedPaths,
      createdAt
    };
  } catch {
    // Malformed cookie value — treat as absent.
  }

  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeCustomHeaders(input: unknown): Record<string, string> {
  if (!isObject(input)) {
    return {};
  }

  const result: Record<string, string> = {};
  let count = 0;

  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_CUSTOM_HEADER_COUNT) {
      break;
    }

    const normalizedKey = String(key).trim();
    const normalizedValue = typeof value === 'string' ? value.trim() : '';

    if (!normalizedKey || !normalizedValue || !HEADER_NAME_TOKEN_REGEX.test(normalizedKey)) {
      continue;
    }

    result[normalizedKey] = normalizedValue;
    count++;
  }

  return result;
}

function normalizeAllowedPaths(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return ['/graphql', '/rest/V', '/api/'];
  }

  const result: string[] = [];
  for (const item of input) {
    if (result.length >= MAX_ALLOWED_PATH_COUNT || typeof item !== 'string') {
      continue;
    }

    const path = item.trim();
    if (!path || !path.startsWith('/')) {
      continue;
    }

    result.push(path);
  }

  return result.length > 0 ? result : ['/graphql', '/rest/V', '/api/'];
}

/** Optional API key: pass a string or a resolver from your app config (no env names required by this package). */
export type ApiKeyResolvable = {
  /** Same value as the Chrome extension popup `debugApiKey` when Magento validates API keys. */
  apiKey?: string;
  /** e.g. `() => loadSecretFromYourApp()` — use whatever you already use for server-side Magento auth. */
  getApiKey?: () => string | undefined;
};

/** Resolves API key from `apiKey` or `getApiKey()` (string wins if non-empty). */
export function resolveDebugApiKey(options: ApiKeyResolvable): string | undefined {
  const direct = options.apiKey?.trim();
  if (direct) {
    return direct;
  }
  return options.getApiKey?.()?.trim() || undefined;
}

/** Options for building debug headers. */
export type DebugHeaderOptions = ApiKeyResolvable & {
  /** Enables X-Debug-Mode when true. Defaults to true. */
  enabled?: boolean;
  /** Optional SSR correlation ID. */
  ssrId?: string;
  /** Optional source/runtime marker value. */
  source?: string;
};

/** Options used by createDebugFetch(). */
export type SsrDebugFetchOptions = ApiKeyResolvable & {
  /** Enables X-Debug-Mode when true. Defaults to true. */
  enabled?: boolean;
  /** Optional source/runtime marker value. */
  source?: string;
  /** Factory for deterministic SSR IDs per request scope. */
  ssrIdFactory?: () => string;
};

/**
 * Creates a new SSR correlation ID.
 */
export function createSsrId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for older runtimes without randomUUID.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Validates SSR ID shape (aligned with Magento `SsrLogStorageService::isValidSsrId`).
 */
export function isValidForwardedSsrId(id: string): boolean {
  if (id === '' || id.length > 128) {
    return false;
  }
  return /^[a-zA-Z0-9._:-]+$/.test(id);
}

/**
 * Builds the canonical debug header set for Magento profiler requests.
 */
export function buildDebugHeaders(options: DebugHeaderOptions): Record<string, string> {
  const enabled = options.enabled ?? true;
  const headers: Record<string, string> = {};
  const apiKey = resolveDebugApiKey(options);

  if (enabled) {
    headers[DEBUG_MODE_HEADER] = 'true';
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

/**
 * Merges headers preserving existing values unless overwritten by extra headers.
 */
export function mergeHeaders(
  base: HeadersInit | undefined,
  extra: Record<string, string>
): Headers {
  const headers = new Headers(base ?? {});
  Object.entries(extra).forEach(([key, value]) => headers.set(key, value));
  return headers;
}

/** RequestInit extension accepted by the wrapped debug fetch. */
export type DebugFetchInit = RequestInit & {
  /** Optional per-call SSR ID override. */
  ssrId?: string;
};

/** Signature returned by createDebugFetch(). */
export type DebugFetch = (
  input: RequestInfo | URL,
  init?: DebugFetchInit
) => Promise<Response>;

/**
 * Creates a fetch wrapper that automatically injects profiler headers.
 *
 * The wrapper keeps behavior identical to native fetch and only adds headers.
 */
export function createDebugFetch(
  fetchImpl: typeof fetch,
  config: SsrDebugFetchOptions
): DebugFetch {
  return async (input: RequestInfo | URL, init?: DebugFetchInit) => {
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

