# @bitbabit/devtools-ssr-bridge

SSR debugging helpers for **Magento Developer Tools** + **Next.js**: patches `fetch` and `axios`, middleware SSR correlation, and Chrome extension / env-based config.

**Full setup (step-by-step, i18n recipe, troubleshooting):** [**docs/SETUP.md**](./docs/SETUP.md)

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
  │ Content script auto-   │      cookie           │ instrumentation.js     │
  │ writes settings to     │ ─────────────────────►│ patches fetch + axios  │
  │ cookie on every page   │                       │                        │
  └────────────────────────┘                       │ Middleware sets        │
                                                   │ X-SSR-ID + request id  │
                                                   │ Layout binds id for    │
                                                   │ parallel RSC calls     │──► Magento
                                                   └────────────────────────┘    (SSR logs)
```

## Install

```bash
npm i @bitbabit/devtools-ssr-bridge
npx devtools-ssr-bridge-setup
```

Then complete **manual** steps in [docs/SETUP.md](./docs/SETUP.md) (middleware + root layout). The CLI does not patch middleware (app-specific).

## Minimal checklist

| Step | Action |
|------|--------|
| 1 | `npm i @bitbabit/devtools-ssr-bridge` |
| 2 | `npx devtools-ssr-bridge-setup` (or follow [SETUP.md](./docs/SETUP.md) by hand) |
| 3 | `next.config` → `export default withDevtoolsSsrBridge(nextConfig)` |
| 4 | `src/instrumentation.js` → `register()` + axios patch (see SETUP) |
| 5 | `src/app/api/devtools/config/route.js` → re-export `next-app-route` |
| 6 | **Middleware** → `prepareDevtoolsSsrRequest` **before** i18n/router; `setSsrIdOnMiddlewareResponse` before return |
| 7 | **Root layout** → `await bindDevtoolsSsrCorrelation()` as first line |
| 8 | **axios module** → `attachAxiosSsrDevtools(axios, …instances)` on server |
| 9 | Enable Chrome extension + save API key; restart `next dev` |

### Verify

- HTML response: one `X-SSR-ID` per page load.
- Magento logs: same `x-ssr-id` on all SSR axios calls for that load.
- Extension profiler loads SSR logs for that id.

## What the setup CLI automates

| File | Created/updated by CLI |
|------|-------------------------|
| `src/instrumentation.{js,ts}` | Yes (recommended axios template) |
| `next.config.{mjs,js,ts}` | Yes (`withDevtoolsSsrBridge`) when export pattern is recognized |
| `src/app/api/devtools/config/route.{js,ts}` | Yes (App Router) |
| `middleware.js` | **No** — copy snippet from [SETUP.md](./docs/SETUP.md) |
| Root `layout.jsx` | **No** — `bindDevtoolsSsrCorrelation()` |

## i18n apps (`next-i18n-router`)

Use this order in middleware:

```js
const devtoolsSsrId = prepareDevtoolsSsrRequest(request, { pathname });
const I18nRes = i18nRouter(request, i18nConfig);
// ...your logic...
setSsrIdOnMiddlewareResponse(I18nRes, devtoolsSsrId);
return I18nRes;
```

Do **not** return `forwardDevtoolsSsrRequestToServer` in place of the i18n response if that breaks locale rewrite. Details: [docs/SETUP.md#recipe-with-i18n-middleware-next-i18n-router](./docs/SETUP.md#recipe-with-i18n-middleware-next-i18n-router).

## Configuration reference

### Environment variables (Node)

| Variable | Value | Purpose |
|---|---|---|
| `DEVTOOLS_SSR_BRIDGE_DEBUG` | `1` | Logs `[devtools-ssr-bridge]` diagnostics |
| `MAGENTO_DEVTOOLS_ENABLED` | `true` | Env fallback when `__devtools_config` is absent |
| `MAGENTO_DEVTOOLS_API_KEY` | string | API key for env fallback |

### Cookies & headers

| Name | Role |
|---|---|
| `__devtools_config` | Debug config (API key, allowed paths, custom headers) |
| `X-SSR-ID` | Response header — extension reads from document |
| `x-devtools-ssr-id` | Request header — middleware → server axios/fetch |

### Config API route

```js
// src/app/api/devtools/config/route.js
export { POST, DELETE } from '@bitbabit/devtools-ssr-bridge/next-app-route';
```

### `withDevtoolsSsrBridge(nextConfig)`

Marks `axios` and this package as server externals so instrumentation patches one Node axios copy.

## Subpath imports

```ts
import { register } from '@bitbabit/devtools-ssr-bridge/instrument';
import { attachAxiosSsrDevtools } from '@bitbabit/devtools-ssr-bridge/attach-axios';
import { bindDevtoolsSsrCorrelation } from '@bitbabit/devtools-ssr-bridge/ssr-correlation';
import { prepareDevtoolsSsrRequest, setSsrIdOnMiddlewareResponse, withDevtoolsSsrBridge } from '@bitbabit/devtools-ssr-bridge/next';
```

## API overview

| Export | Package | Purpose |
|---|---|---|
| `register()` | `instrument` | Patch global `fetch` |
| `attachAxiosSsrDevtools` | `attach-axios` | Patch axios instance(s) |
| `patchAxiosCreate` | `instrument` | Patch `axios.create()` |
| `prepareDevtoolsSsrRequest` | `next` | Middleware: set request SSR id |
| `setSsrIdOnMiddlewareResponse` | `next` | Middleware: set `X-SSR-ID` on HTML |
| `bindDevtoolsSsrCorrelation` | `ssr-correlation` | Root layout: one id for parallel calls |
| `withDevtoolsSsrBridge` | `next` | Wrap `next.config` |

Full API tables and cookie reference remain in older sections of this package source; prefer [SETUP.md](./docs/SETUP.md) for integration.

## Publish

Maintainers: [docs/NPM_PUBLISH.md](./docs/NPM_PUBLISH.md). Changelog: [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
