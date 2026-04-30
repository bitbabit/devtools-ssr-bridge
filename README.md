# @bitbabit/devtools-ssr-bridge

SSR debugging helpers for Magento Developer Tools with Next.js: patches `fetch`, optional axios interceptors, middleware correlation, and cookie/env-based config.

## How It Works

```
  Chrome Extension (browser)              Next.js Server
  ────────────────────────────            ────────────────────────────
  ┌────────────────────────┐
  │ Extension enabled +    │
  │ API key configured     │
  └───────────┬────────────┘
              │
              ▼
  ┌────────────────────────┐   __devtools_config   ┌────────────────────────┐
  │ Content script auto-   │      cookie           │                        │
  │ writes settings to     │ ─────────────────────►│ instrumentation.ts     │
  │ cookie on every page   │                       │ patches global fetch   │
  └────────────────────────┘                       │                        │
                                                   │ Every fetch() to       │
                                                   │ /graphql or /rest/     │
                                                   │ auto-gets:             │
                                                   │  • X-Debug-Mode        │
                                                   │  • X-Debug-Api-Key     │──► Magento
                                                   │  • X-SSR-ID            │    (stores logs)
                                                   │  • X-SSR-Source        │
                                                   │  • custom headers      │
                                                   └────────────────────────┘
```

**`fetch()`** is patched globally via `instrumentation`. **axios** (typical Next.js webpack bundle) needs one explicit server-side hook — see below.

## Install & configure (checklist)

1. **Install the package**

   ```bash
   npm i @bitbabit/devtools-ssr-bridge
   ```

   Optional: `npx devtools-ssr-bridge-setup` creates or updates `instrumentation` and, for App Router, `app/.../api/devtools/config/route.{ts,js}` re-exporting `next-app-route` (it does not wire axios or middleware for you).

2. **Next.js config** — wrap your config so server bundles treat `axios` and the bridge consistently (recommended):

   ```js
   import { withDevtoolsSsrBridge } from '@bitbabit/devtools-ssr-bridge/next';
   export default withDevtoolsSsrBridge({ /* your next config */ });
   ```

3. **Instrumentation** — enable the global `fetch` patch (runs when the Node server starts):

   ```ts
   // instrumentation.ts (project root or src/)
   export { register } from '@bitbabit/devtools-ssr-bridge/instrument';
   ```

   Or CommonJS:

   ```js
   const { register } = require('@bitbabit/devtools-ssr-bridge/instrument');
   module.exports = { register };
   ```

4. **axios** — after you create instances, attach interceptors **once on the server** (same module as your `axios.create()`):

   ```js
   import axios from 'axios';
   const customerAxios = axios.create();
   if (typeof window === 'undefined') {
     try {
       const { attachAxiosSsrDevtools } = require('@bitbabit/devtools-ssr-bridge/attach-axios');
       attachAxiosSsrDevtools(axios, customerAxios);
     } catch { /* optional dep */ }
   }
   ```

5. **Middleware (recommended)** — correlate the document request with outbound Magento calls: when `__devtools_config` is present, set internal header `x-devtools-ssr-id` on the request and echo `X-SSR-ID` on the response:

   ```ts
   import { prepareDevtoolsSsrRequest, setSsrIdOnMiddlewareResponse } from '@bitbabit/devtools-ssr-bridge/next';
   // const ssrId = prepareDevtoolsSsrRequest(request);
   // … later on your NextResponse: setSsrIdOnMiddlewareResponse(response, ssrId);
   ```

   Or use `devtoolsSsrCorrelationMiddleware(request, NextResponse)` if that fits your app.

6. **Chrome extension** — enable it on your Next origin so it can set the `__devtools_config` cookie (API key, allowed paths, custom headers). Without that cookie (and without env fallback below), the bridge does not inject headers.

7. **Optional env fallback** (no extension / CI) — set on the **Node** process:

   - `MAGENTO_DEVTOOLS_ENABLED=true`
   - `MAGENTO_DEVTOOLS_API_KEY=<same key as Magento expects>`

8. **Debug logging** — `DEVTOOLS_SSR_BRIDGE_DEBUG=1` on the Node process prints `[devtools-ssr-bridge]` messages.

9. **Optional: App Router config API** — if you use the React popup / httpOnly cookie flow, add a route that saves config (see [Config API route](#config-api-route-app-router) below).

### Manual setup (instrumentation only)

```ts
// instrumentation.ts
export { register } from '@bitbabit/devtools-ssr-bridge/instrument';
```

### If you already have an instrumentation.ts

```ts
// instrumentation.ts
import { patchFetch } from '@bitbabit/devtools-ssr-bridge/instrument';

export function register() {
  patchFetch();
  // ... your other instrumentation logic ...
}
```

## How It Works Under the Hood

1. **Chrome extension** — The content script reads your settings (API key, custom headers, allowed paths) from `chrome.storage.sync` and writes them into a `__devtools_config` cookie on every page load. Re-syncs in real-time when you change settings.

2. **`instrumentation.ts`** — When Next.js starts, `register()` patches `globalThis.fetch`. The patched fetch awaits Next’s dynamic request APIs (`connection()` from `next/server` where present, then async `cookies()` / `headers()` from `next/headers`) so header reads work with Next’s rendering model.

   Then it:
   - Reads the `__devtools_config` cookie via `next/headers`
   - Checks if the outgoing URL matches `allowedPaths` from the cookie (e.g. `/graphql`, `/rest/V`)
   - If it matches, injects `X-Debug-Mode`, `X-Debug-Api-Key`, `X-SSR-ID`, `X-SSR-Source`, and any custom headers
   - If it doesn't match, passes through to the original `fetch` unchanged

3. **Magento** — Receives the headers, stores profiler data keyed by `X-SSR-ID` in cache

4. **Chrome extension panel** — Reads `X-SSR-ID` from response headers, fetches SSR logs from Magento's API, displays them alongside browser requests

## URL Filtering

The package only injects headers on requests whose URL contains one of the `allowedPaths` from the extension config. By default:

- `/graphql`
- `/rest/V`
- `/rest/all/V`
- `/api/`

You can customize these in the Chrome extension's popup settings. The content script automatically syncs them to the cookie.

## Configuration reference

### Environment variables (Node / Next server)

| Variable | Value | Purpose |
|---|---|---|
| `DEVTOOLS_SSR_BRIDGE_DEBUG` | `1` | Logs `[devtools-ssr-bridge]` diagnostics (fetch/axios interceptors). |
| `MAGENTO_DEVTOOLS_ENABLED` | `true` | When `__devtools_config` is absent, enables bridge via env (e.g. CI). |
| `MAGENTO_DEVTOOLS_API_KEY` | string | API key paired with `MAGENTO_DEVTOOLS_ENABLED` (must match Magento). |

### Cookies & HTTP headers

Import names from `@bitbabit/devtools-ssr-bridge/core` if you need the same strings in app code.

| Name | Kind | Notes |
|---|---|---|
| `__devtools_config` | Cookie (`DEVTOOLS_CONFIG_COOKIE`) | Serialized debug config (API key, `allowedPaths`, custom headers). Server reads via `next/headers`. |
| `__devtools_probe` | Cookie (`DEVTOOLS_PROBE_COOKIE`) | Short-lived; middleware can set when probe sees debug mode; popup UX. |
| `X-SSR-ID` | Response header (`SSR_ID_HEADER`) | Correlates SSR; extension / Magento use it. |
| `x-devtools-ssr-id` | Request header (`SSR_ID_REQUEST_HEADER`) | Middleware sets on the request so SSR fetches share one id. |
| `X-Debug-Mode` | Request header (`DEBUG_MODE_HEADER`) | Enables profiler on Magento. |
| `X-Debug-Api-Key` | Request header (`DEBUG_API_KEY_HEADER`) | Authenticates debug traffic. |
| `X-SSR-Source` | Request header (`SSR_SOURCE_HEADER`) | e.g. `nextjs`. |

### `withDevtoolsSsrBridge(nextConfig)`

Merges `serverExternalPackages` / `serverComponentsExternalPackages` to include `axios` and this package, and (on the Node server webpack build) adds an `externals` hook so `axios` resolves as `commonjs axios` — helps avoid duplicate axios copies on the server.

### Config API route (App Router)

To persist popup-submitted config into an **httpOnly** `__devtools_config` cookie, use either a **one-line re-export** (default TTL matches the Chrome extension, **6 hours** via `DEVTOOLS_CONFIG_TTL` in `core`) or a custom handler.

**Re-export (recommended):**

```ts
// app/api/devtools/config/route.ts
export { POST, DELETE } from '@bitbabit/devtools-ssr-bridge/next-app-route';
```

**Custom options** (validation, TTL override):

```ts
// app/api/devtools/config/route.ts
import { createDevToolsConfigHandler } from '@bitbabit/devtools-ssr-bridge/next';

export const { POST, DELETE } = createDevToolsConfigHandler();
// Optional: { validateApiKey: async (key) => true, configTtl: 6 * 60 * 60 }
```

`POST` saves config; `DELETE` clears config + probe cookies. Point your React popup at the same path.

### Peer dependencies

`package.json` declares optional peers `next` (>=13) and `react` (>=18). Apps using only `instrument` + `fetch` still need **Next** for `next/headers` at runtime. **axios** is not a peer; add it in your app when using `attach-axios`.

## API Reference

### Root package (`@bitbabit/devtools-ssr-bridge`)

The main entry re-exports `core`, `next`, `react`, `instrument`, and `extension-align` utilities. Prefer subpath imports (`/next`, `/instrument`, …) for smaller bundles.

### Instrumentation & axios

| Export | Description |
|---|---|
| `register()` | Next.js `instrumentation.ts` hook — patches `fetch` globally |
| `patchFetch()` | Same thing, for use inside your own `register()` function |
| `patchAxios(instance)` | Request interceptor on one axios instance (`instrument`) |
| `attachAxiosSsrDevtools(...instances)` | Calls `patchAxios` for each instance; server-only (`attach-axios`) |
| `getDebugHeaders(url)` | **Async.** `Promise<…>` of headers to add for a URL, or `null` if debug off / path not allowed — use `await getDebugHeaders(url)` |
| `patchAxiosDefault()` | Deprecated no-op (use `attachAxiosSsrDevtools` / `patchAxios`) |

### Next.js (`@bitbabit/devtools-ssr-bridge/next`)

| Export | Description |
|---|---|
| `withDevtoolsSsrBridge` | Wraps `next.config` (see above) |
| `prepareDevtoolsSsrRequest` | Sets `x-devtools-ssr-id` on middleware request; returns ssr id |
| `setSsrIdOnMiddlewareResponse` | Sets `X-SSR-ID` on middleware response |
| `devtoolsSsrCorrelationMiddleware` | Convenience: next + attach headers |
| `createDevToolsConfigHandler` | App Router `POST`/`DELETE` for config cookie |
| `handleDevToolsProbe` | Optional probe handling for `__devtools_probe` |
| `readDevToolsConfig` / `hasDevToolsProbe` | Read cookie state in Route Handlers / RSC |
| `getAutoDebugFetch` | `{ fetch, ssrId }` from cookie store |
| `withDevToolsHeaders` | Merge debug headers into `RequestInit` |
| `createSsrContextFromCookies` | Full SSR context from cookies |
| `createNextSsrContext` | Manual SSR context (no `next/headers`) |
| `attachSsrIdToNextResponse` | Echo `X-SSR-ID` on a response |

### Core Utilities

| Function | Description |
|---|---|
| `createSsrId()` | Generates a UUID v4 SSR correlation ID |
| `buildDebugHeaders(options)` | Builds the canonical debug header set |
| `createDebugFetch(fetchImpl, config)` | Wraps fetch with auto header injection |

### React Helpers

| Export | Description |
|---|---|
| `ReactSsrDebugContext` | React context for SSR ID propagation |
| `useSsrId()` | Hook to read SSR ID from context |

## Cookie Reference

| Cookie | Set By | Purpose | Default TTL |
|---|---|---|---|
| `__devtools_config` | Extension content script (JS) **or** `createDevToolsConfigHandler` (httpOnly) | API key, `allowedPaths`, custom headers | 6 hours (`DEVTOOLS_CONFIG_TTL`, aligned with the extension) |
| `__devtools_probe` | Middleware / `handleDevToolsProbe` | Signals popup to show config UI | 5 min (`DEVTOOLS_PROBE_TTL`) |

See also [Configuration reference — Cookies & HTTP headers](#cookies--http-headers).

## Subpath Imports

```ts
import { register } from '@bitbabit/devtools-ssr-bridge/instrument';   // fetch patch
import { attachAxiosSsrDevtools } from '@bitbabit/devtools-ssr-bridge/attach-axios';
import { ... } from '@bitbabit/devtools-ssr-bridge/next';             // middleware, withDevtoolsSsrBridge, …
import { ... } from '@bitbabit/devtools-ssr-bridge/react';            // React context
import { ... } from '@bitbabit/devtools-ssr-bridge/core';             // constants & types
```

Config API route (App Router) — re-export the default handler:

```ts
// app/api/devtools/config/route.ts
export { POST, DELETE } from '@bitbabit/devtools-ssr-bridge/next-app-route';
```

### Package `exports` and Node / Next

For **`instrument`** and **`attach-axios`**, this package publishes an **`exports["node"]`** entry pointing at the **CommonJS** `.cjs` builds. Next’s server-side resolution uses that condition so the instrumentation bundle does not pull in an ESM graph that depends on `node:module` in a way webpack rejects. You normally do not configure anything — importing `@bitbabit/devtools-ssr-bridge/instrument` from `instrumentation` should resolve correctly on recent Next versions.

## Notes

- **`getDebugHeaders`** is asynchronous; always **`await`** it (or use `.then`) when calling from server code.
- All `fetch()` calls within the same Next.js request share one `X-SSR-ID` — Magento groups them into a single SSR log entry.
- Headers set explicitly by your app code are never overwritten by the patch.
- When the extension is disabled or the cookie expires, `fetch` is called with zero overhead — no cookie parsing, no header injection.
- The extension content script may set `__devtools_config` from the client (not httpOnly). If you use `createDevToolsConfigHandler`, the same cookie name can be set **httpOnly** from your server. The API key is sensitive in either case — treat it like a secret in production.
