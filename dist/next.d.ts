import { DebugFetch, DevToolsConfig } from './core.js';

/** Configuration for Next.js SSR bridge context. */
type NextBridgeConfig = {
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
type NextSsrContext = {
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
declare function createNextSsrContext(config?: NextBridgeConfig): NextSsrContext;
/**
 * Propagates the SSR ID back to the browser via a response header so the
 * Chrome extension can discover it and fetch the corresponding SSR logs.
 *
 * @param response - Any object with a `headers.set()` method (e.g. `NextResponse`).
 * @param ssrId    - The SSR correlation ID.
 */
declare function attachSsrIdToNextResponse(response: {
    headers: {
        set: (name: string, value: string) => void;
    };
}, ssrId: string): void;
/**
 * Minimal duck-typed interfaces so we can work with Next.js `NextRequest`
 * and `NextResponse` without importing the `next` package directly.
 */
interface MiddlewareRequest {
    headers: {
        get(name: string): string | null;
    };
}
interface MiddlewareResponse {
    cookies: {
        set(name: string, value: string, options?: Record<string, unknown>): void;
    };
}
/** Options for {@link handleDevToolsProbe}. */
interface DevToolsProbeOptions {
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
declare function handleDevToolsProbe(request: MiddlewareRequest, response: MiddlewareResponse, options?: DevToolsProbeOptions): boolean;
/**
 * Duck-typed `NextRequest` for SSR correlation (avoids importing `next`).
 */
interface CorrelationMiddlewareRequest extends MiddlewareRequest {
    cookies: {
        get(name: string): {
            value: string;
        } | undefined;
    };
    headers: Headers;
}
/**
 * Duck-typed `NextResponse` static (pass `NextResponse` from `next/server`).
 */
interface CorrelationNextResponse {
    next: () => {
        headers: {
            set: (name: string, value: string) => void;
        };
    };
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
declare function prepareDevtoolsSsrRequest(request: CorrelationMiddlewareRequest): string | null;
/**
 * Sets `X-SSR-ID` on a middleware `NextResponse` when SSR correlation is active.
 */
declare function setSsrIdOnMiddlewareResponse(response: {
    headers: {
        set: (name: string, value: string) => void;
    };
}, ssrId: string | null): void;
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
declare function devtoolsSsrCorrelationMiddleware(request: CorrelationMiddlewareRequest, NextResponse: CorrelationNextResponse): ReturnType<CorrelationNextResponse['next']>;
/** Options for {@link createDevToolsConfigHandler}. */
interface DevToolsConfigHandlerOptions {
    /** Override the config cookie TTL in seconds. Defaults to {@link DEVTOOLS_CONFIG_TTL} (6 hours). */
    configTtl?: number;
    /**
     * Optional server-side validation for the submitted API key.
     * Return `true` to accept, `false` to reject with 403.
     */
    validateApiKey?: (apiKey: string) => boolean | Promise<boolean>;
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
declare function createDevToolsConfigHandler(options?: DevToolsConfigHandlerOptions): {
    POST: (request: Request) => Promise<Response>;
    DELETE: () => Promise<Response>;
};
/**
 * Duck-typed cookie accessor. Matches the shape returned by
 * `cookies()` from `next/headers` as well as plain `Map`-like objects.
 */
interface CookieStore {
    get(name: string): {
        value: string;
    } | undefined;
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
declare function readDevToolsConfig(cookies: CookieStore): DevToolsConfig | null;
/**
 * Checks whether the probe cookie is present, indicating the Chrome
 * extension has sent the initial debug signal.
 *
 * @param cookies - A cookie store.
 * @returns `true` if the probe cookie exists.
 */
declare function hasDevToolsProbe(cookies: CookieStore): boolean;
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
declare function createSsrContextFromCookies(cookies: CookieStore, overrides?: Partial<NextBridgeConfig>): NextSsrContext | null;
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
declare function getAutoDebugFetch(cookies: CookieStore, overrides?: Partial<NextBridgeConfig>): {
    fetch: typeof globalThis.fetch | DebugFetch;
    ssrId: string | null;
};
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
declare function withDevToolsHeaders(cookies: CookieStore, init?: RequestInit): RequestInit;
type NextConfigWithExperimental = Record<string, unknown> & {
    experimental?: Record<string, unknown>;
    webpack?: (config: Record<string, unknown>, context: {
        isServer: boolean;
        nextRuntime?: 'nodejs' | 'edge';
    }) => Record<string, unknown>;
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
declare function withDevtoolsSsrBridge(nextConfig?: NextConfigWithExperimental): NextConfigWithExperimental;

export { type DevToolsConfigHandlerOptions, type DevToolsProbeOptions, type NextBridgeConfig, type NextConfigWithExperimental, type NextSsrContext, attachSsrIdToNextResponse, createDevToolsConfigHandler, createNextSsrContext, createSsrContextFromCookies, devtoolsSsrCorrelationMiddleware, getAutoDebugFetch, handleDevToolsProbe, hasDevToolsProbe, prepareDevtoolsSsrRequest, readDevToolsConfig, setSsrIdOnMiddlewareResponse, withDevToolsHeaders, withDevtoolsSsrBridge };
