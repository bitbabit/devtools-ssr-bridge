# Setup guide — `@bitbabit/devtools-ssr-bridge`

Complete setup for **Next.js App Router** + **Magento Developer Tools Chrome extension** + **axios** SSR calls.

**Goal:** one `X-SSR-ID` per HTML page load, the same id on every server-side Magento `axios`/`fetch` call, and the extension reading that id from the document response.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Next.js 13+ (App Router) | Middleware + `instrumentation` supported |
| Magento with `magento2-dev-tools` (or equivalent) | Accepts `X-Debug-Mode`, `X-Debug-Api-Key`, `X-SSR-ID` |
| Chrome extension | Host permission for your Next.js origin |
| `axios` on the server | Most storefronts use axios for GraphQL/REST |

---

## Quick start (automated + manual)

```bash
npm i @bitbabit/devtools-ssr-bridge
npx devtools-ssr-bridge-setup
```

The CLI creates/updates:

- `src/instrumentation.{js,ts}` (recommended axios + fetch wiring)
- `next.config.{mjs,js,ts}` → `withDevtoolsSsrBridge(...)` when possible
- `src/app/api/devtools/config/route.{js,ts}` (extension httpOnly cookie API)

You still add **middleware** and **root layout** manually (see below). Apps with **i18n middleware** (e.g. `next-i18n-router`) must follow the [i18n recipe](#recipe-with-i18n-middleware-next-i18n-router).

---

## Full checklist

### 1. Install

```bash
npm i @bitbabit/devtools-ssr-bridge
```

Pin a version in `package.json` after publish (e.g. `"@bitbabit/devtools-ssr-bridge": "^0.2.0"`).

### 2. `next.config` — wrap with `withDevtoolsSsrBridge`

Keeps a single Node `axios` copy so instrumentation can patch interceptors.

```js
// next.config.mjs
import { withDevtoolsSsrBridge } from '@bitbabit/devtools-ssr-bridge/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...your config
};

export default withDevtoolsSsrBridge(nextConfig);
```

If you already export a named config:

```js
export default withDevtoolsSsrBridge(nextConfig);
```

### 3. `instrumentation` — patch `fetch` + `axios` at startup

**Recommended** (works with webpack-bundled axios; do **not** import your app’s `lib/axios` here — that can pull client-only deps and break the bundle):

```js
// src/instrumentation.js
/**
 * Patches fetch + axios at server startup.
 * Do not import app axios modules here (can break the instrumentation bundle).
 */
export async function register() {
  const { register: registerDevtools } = await import('@bitbabit/devtools-ssr-bridge/instrument');
  registerDevtools();

  if (typeof window === 'undefined') {
    const axios = (await import('axios')).default;
    const { attachAxiosSsrDevtools } = await import('@bitbabit/devtools-ssr-bridge/attach-axios');
    attachAxiosSsrDevtools(axios);
    const { patchAxiosCreate } = await import('@bitbabit/devtools-ssr-bridge/instrument');
    patchAxiosCreate(axios);
  }
}
```

Minimal (fetch only — axios must be wired in your axios module):

```js
export { register } from '@bitbabit/devtools-ssr-bridge/instrument';
```

Restart the dev server after any instrumentation change.

### 4. App axios module — attach instances (if you use `axios.create()`)

In the module where you create server axios instances (e.g. `src/lib/utils/axios.js`):

```js
import axios from 'axios';
import { attachAxiosSsrDevtools } from '@bitbabit/devtools-ssr-bridge/attach-axios';

export const customerAxios = axios.create();

if (typeof window === 'undefined') {
  attachAxiosSsrDevtools(axios, customerAxios);
}
```

Keep **both** instrumentation `patchAxiosCreate` and this attach if you have multiple entry paths; otherwise test with instrumentation only.

### 5. App Router — config API route (Chrome extension)

```js
// src/app/api/devtools/config/route.js
export { POST, DELETE } from '@bitbabit/devtools-ssr-bridge/next-app-route';
```

The extension (or popup) POSTs the API key and allowed paths; the server stores them in httpOnly `__devtools_config`.

### 6. Middleware — mint id + echo `X-SSR-ID` (manual)

Required when using the extension cookie flow. Call **`prepareDevtoolsSsrRequest` before** any router that snapshots `request.headers` (e.g. `i18nRouter`).

```js
import {
  prepareDevtoolsSsrRequest,
  setSsrIdOnMiddlewareResponse,
} from '@bitbabit/devtools-ssr-bridge/next';

export function middleware(request) {
  const pathname = request.nextUrl.pathname;

  const devtoolsSsrId = prepareDevtoolsSsrRequest(request, { pathname });

  // Your i18n / routing (must run AFTER prepare so request headers include x-devtools-ssr-id)
  const response = i18nRouter(request, i18nConfig);

  // ...your existing header/cookie logic...

  setSsrIdOnMiddlewareResponse(response, devtoolsSsrId);
  return response;
}
```

`prepareDevtoolsSsrRequest` only runs when `__devtools_config` exists and the path is a storefront document (skips `/api`, `/_next`, `com.chrome.devtools.json`, etc.).

### 7. Root layout — bind SSR id for parallel RSC/axios (pick one)

**Option A — root layout (recommended for apps that already use layout):**

```jsx
// src/app/[locale]/layout.jsx
import { bindDevtoolsSsrCorrelation } from '@bitbabit/devtools-ssr-bridge/ssr-correlation';

export default async function RootLayout({ children }) {
  await bindDevtoolsSsrCorrelation(); // first line, before any Magento calls
  // ...
}
```

**Option B — `getHeaders()` helper:**

```js
import { readSsrIdFromAppRouterHeaders } from '@bitbabit/devtools-ssr-bridge/ssr-correlation';

export const getHeaders = cache(async () => {
  await readSsrIdFromAppRouterHeaders();
  // ...existing headers logic
});
```

Use **one** of A or B, not both.

### 8. Chrome extension

1. Enable the extension on your Next.js dev/stage host.
2. Open the popup, enter the Magento debug API key (must match Magento config).
3. Save — sets `__devtools_config` (via content script and/or `POST /api/devtools/config`).
4. Hard-refresh a page.

### 9. Verify

| Check | Expected |
|--------|----------|
| Document response header | `X-SSR-ID: <uuid>` (one per page load) |
| Magento `gsf_custom.log` (or equivalent) | Same `x-ssr-id` on every **axios** SSR line for that load |
| Extension SSR panel | `/rest/V1/devtools/ssr-logs/{id}` returns data for that id |

Debug: `DEVTOOLS_SSR_BRIDGE_DEBUG=1 npm run dev`

---

## Recipe with i18n middleware (`next-i18n-router`)

This matches production setups where `i18nRouter` copies `request.headers` into `NextResponse.next({ request: { headers } })`.

**Do:**

1. `prepareDevtoolsSsrRequest(request, { pathname })` **before** `i18nRouter(request, config)`.
2. Mutate the **same** response you return (`I18nRes`), then `setSsrIdOnMiddlewareResponse(I18nRes, devtoolsSsrId)`.
3. `return I18nRes` (do not replace with a plain `NextResponse.next()` unless you re-apply i18n cookies/rewrite).
4. `await bindDevtoolsSsrCorrelation()` at the top of root layout.

**Do not (known regressions):**

- `forwardDevtoolsSsrRequestToServer` **instead of** returning the i18n response — breaks locale rewrite.
- Reuse `__devtools_ssr_id` cookie across pages — same id on every navigation.
- `prepareDevtoolsSsrRequest` **after** `i18nRouter` — server never sees `x-devtools-ssr-id`.
- Import app `axios.js` (with crypto/client deps) inside `instrumentation.js`.

**Example (minimal):**

```js
const devtoolsSsrId = prepareDevtoolsSsrRequest(request, { pathname });
const I18nRes = i18nRouter(request, i18nConfig);
// ...existing I18nRes cookies/headers...
setSsrIdOnMiddlewareResponse(I18nRes, devtoolsSsrId);
return I18nRes;
```

---

## Env-only (no extension)

On the **Node** process:

```env
MAGENTO_DEVTOOLS_ENABLED=true
MAGENTO_DEVTOOLS_API_KEY=your-magento-debug-key
```

Middleware `X-SSR-ID` on HTML still requires `__devtools_config` unless you extend your app. Env enables axios/fetch injection when the cookie is absent.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| No `X-SSR-ID` on HTML | No `__devtools_config` | Re-save extension config; check `/api/devtools/config` |
| Different `x-ssr-id` per SSR call | Layout bind missing or prepare after i18n | `bindDevtoolsSsrCorrelation` first in layout; prepare before i18n |
| Extension id ≠ Magento logs | Extra middleware hit (`com.chrome.devtools.json`) | Excluded by bridge; ignore or tighten matcher |
| No debug headers at all | Instrumentation not loaded | Restart server; confirm `src/instrumentation.js` exists |
| axios not patched | Bundled duplicate axios | `withDevtoolsSsrBridge` + attach in instrumentation/axios module |

---

## File map (typical App Router project)

```
next.config.mjs          → withDevtoolsSsrBridge
src/instrumentation.js   → register() + axios patch
src/middleware.js        → prepare + setSsrId (manual)
src/app/.../layout.jsx   → bindDevtoolsSsrCorrelation
src/lib/.../axios.js     → attachAxiosSsrDevtools (optional extra)
src/app/api/devtools/config/route.js → POST/DELETE re-export
```

---

## Magento side

- API key in Magento admin must match extension / `MAGENTO_DEVTOOLS_API_KEY`.
- SSR logs keyed by `X-SSR-ID` in cache (`devtools_ssr_*`).
- GraphQL logger should log `x-ssr-id` in `request_headers` for verification.

---

## Publish / version

See [NPM_PUBLISH.md](./NPM_PUBLISH.md). After install from npm, match this doc’s version in `package.json`.
