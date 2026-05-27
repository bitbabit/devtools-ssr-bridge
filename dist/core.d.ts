/** Header used to correlate Magento SSR/internal logs. */
declare const SSR_ID_HEADER = "X-SSR-ID";
/**
 * Internal request header set by Next.js middleware so the document response
 * and outbound Magento fetches share the same SSR ID.
 */
declare const SSR_ID_REQUEST_HEADER = "x-devtools-ssr-id";
/** Header that enables profiler mode on the backend. */
declare const DEBUG_MODE_HEADER = "X-Debug-Mode";
/** Header used to authenticate debug/profiler requests. */
declare const DEBUG_API_KEY_HEADER = "X-Debug-Api-Key";
/** Header that describes runtime/source (e.g. nextjs, react-ssr). */
declare const SSR_SOURCE_HEADER = "X-SSR-Source";
/**
 * Short-lived, client-readable cookie set by middleware when `X-Debug-Mode`
 * header is detected on the incoming document request. Tells the React
 * popup component to show the configuration form.
 */
declare const DEVTOOLS_PROBE_COOKIE = "__devtools_probe";
/**
 * httpOnly cookie that stores the full debug configuration (API key,
 * custom headers, enabled flag). Only readable on the server; the React
 * popup writes it via the config API route.
 */
declare const DEVTOOLS_CONFIG_COOKIE = "__devtools_config";
/**
 * httpOnly cookie mirroring the active SSR correlation ID for this browser
 * session. Set by middleware together with `X-SSR-ID` so parallel RSC/axios
 * calls read the same id via `cookies()` on the Node server.
 */
declare const DEVTOOLS_SSR_ID_COOKIE = "__devtools_ssr_id";
/** Default TTL for the probe cookie in seconds (5 minutes). */
declare const DEVTOOLS_PROBE_TTL = 300;
/** Default TTL for the config cookie in seconds (6 hours; aligned with Chrome extension). */
declare const DEVTOOLS_CONFIG_TTL: number;
/** Debug configuration persisted in the cookie by the Chrome extension. */
interface DevToolsConfig {
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
declare function serializeDevToolsConfig(config: DevToolsConfig): string;
/**
 * Deserializes a cookie value back into a {@link DevToolsConfig}.
 *
 * @param raw - The raw cookie string value.
 * @returns Parsed config or `null` on failure.
 */
declare function deserializeDevToolsConfig(raw: string | undefined | null): DevToolsConfig | null;
/** Optional API key: pass a string or a resolver from your app config (no env names required by this package). */
type ApiKeyResolvable = {
    /** Same value as the Chrome extension popup `debugApiKey` when Magento validates API keys. */
    apiKey?: string;
    /** e.g. `() => loadSecretFromYourApp()` — use whatever you already use for server-side Magento auth. */
    getApiKey?: () => string | undefined;
};
/** Resolves API key from `apiKey` or `getApiKey()` (string wins if non-empty). */
declare function resolveDebugApiKey(options: ApiKeyResolvable): string | undefined;
/** Options for building debug headers. */
type DebugHeaderOptions = ApiKeyResolvable & {
    /** Enables X-Debug-Mode when true. Defaults to true. */
    enabled?: boolean;
    /** Optional SSR correlation ID. */
    ssrId?: string;
    /** Optional source/runtime marker value. */
    source?: string;
};
/** Options used by createDebugFetch(). */
type SsrDebugFetchOptions = ApiKeyResolvable & {
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
declare function createSsrId(): string;
/**
 * Validates SSR ID shape (aligned with Magento `SsrLogStorageService::isValidSsrId`).
 */
declare function isValidForwardedSsrId(id: string): boolean;
/**
 * Builds the canonical debug header set for Magento profiler requests.
 */
declare function buildDebugHeaders(options: DebugHeaderOptions): Record<string, string>;
/**
 * Merges headers preserving existing values unless overwritten by extra headers.
 */
declare function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): Headers;
/** RequestInit extension accepted by the wrapped debug fetch. */
type DebugFetchInit = RequestInit & {
    /** Optional per-call SSR ID override. */
    ssrId?: string;
};
/** Signature returned by createDebugFetch(). */
type DebugFetch = (input: RequestInfo | URL, init?: DebugFetchInit) => Promise<Response>;
/**
 * Creates a fetch wrapper that automatically injects profiler headers.
 *
 * The wrapper keeps behavior identical to native fetch and only adds headers.
 */
declare function createDebugFetch(fetchImpl: typeof fetch, config: SsrDebugFetchOptions): DebugFetch;

export { type ApiKeyResolvable, DEBUG_API_KEY_HEADER, DEBUG_MODE_HEADER, DEVTOOLS_CONFIG_COOKIE, DEVTOOLS_CONFIG_TTL, DEVTOOLS_PROBE_COOKIE, DEVTOOLS_PROBE_TTL, DEVTOOLS_SSR_ID_COOKIE, type DebugFetch, type DebugFetchInit, type DebugHeaderOptions, type DevToolsConfig, SSR_ID_HEADER, SSR_ID_REQUEST_HEADER, SSR_SOURCE_HEADER, type SsrDebugFetchOptions, buildDebugHeaders, createDebugFetch, createSsrId, deserializeDevToolsConfig, isValidForwardedSsrId, mergeHeaders, resolveDebugApiKey, serializeDevToolsConfig };
