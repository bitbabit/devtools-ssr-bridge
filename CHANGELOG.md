# Changelog

## 0.2.1 — 2026-05-27

### Fixed

- **`ssr-correlation`**: Marked `server-only` and removed `import { cache } from 'react'`, which broke client bundles with `The requested module 'react' does not provide an export named 'cache'`. Uses `pinSsrIdForRequest` instead.

## 0.2.0 — 2026-05-27

### Documentation

- Added [docs/SETUP.md](./docs/SETUP.md) — full setup checklist, i18n middleware recipe, troubleshooting, verification steps.
- README points to SETUP guide and clarifies what `devtools-ssr-bridge-setup` automates vs manual steps.

### Setup CLI

- Wraps `next.config` with `withDevtoolsSsrBridge` when safe.
- Creates recommended `instrumentation` template (fetch + axios + `patchAxiosCreate`).
- Prints copy-paste snippets for middleware and root layout.

### Notes

- **Working i18n pattern:** `prepareDevtoolsSsrRequest` before `i18nRouter`, `setSsrIdOnMiddlewareResponse` on the i18n response, `return` that response, `bindDevtoolsSsrCorrelation` in root layout.
- Avoid `forwardDevtoolsSsrRequestToServer` when it replaces i18n rewrite responses.

## 0.1.x

Earlier releases: fetch/axios instrumentation, middleware helpers, config API route, SSR correlation utilities.
