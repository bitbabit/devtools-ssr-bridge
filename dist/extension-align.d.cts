/**
 * Alignment reference for the Chrome extension `magento2-chrome-profiler`
 * (`defaults.js` → `EXTENSION_DEFAULTS`).
 *
 * The extension can only inject headers for requests **from the browser tab**.
 * Server-side (Next.js/React SSR) calls must set the same header **names** and
 * semantics yourself; this module documents those defaults for parity.
 */
declare const CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS: readonly ["/rest/V", "/graphql", "/api/", "/section/load"];
declare const CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS: readonly [".json", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".otf"];

export { CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS, CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS };
