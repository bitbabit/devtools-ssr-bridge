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
declare function register(): void;
declare function patchFetch(): void;
/**
 * @deprecated No longer installs anything. Use `attachAxiosSsrDevtools` from
 * `@bitbabit/devtools-ssr-bridge/attach-axios` (or `patchAxios` per instance).
 */
declare function patchAxiosDefault(): void;
declare function patchAxios(axiosInstance: AxiosLike): number;
declare function getDebugHeaders(url: string): Promise<Record<string, string> | null>;
interface AxiosRequestConfig {
    url?: string;
    baseURL?: string;
    headers?: Record<string, unknown>;
}
interface AxiosLike {
    interceptors: {
        request: {
            use(onFulfilled: (config: AxiosRequestConfig) => AxiosRequestConfig | Promise<AxiosRequestConfig>): number;
        };
    };
}

export { getDebugHeaders, patchAxios, patchAxiosDefault, patchFetch, register };
