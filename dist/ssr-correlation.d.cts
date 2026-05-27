/**
 * Reads the SSR id forwarded from middleware into this RSC request.
 */
declare const readSsrIdFromAppRouterHeaders: () => Promise<string | null>;
/**
 * Resolves the SSR id middleware forwarded into this RSC request. Call at the top
 * of root `layout.jsx` / `layout.tsx` before any Magento `axios` / `fetch`.
 */
declare const bindDevtoolsSsrCorrelation: () => Promise<string | null>;

export { bindDevtoolsSsrCorrelation, readSsrIdFromAppRouterHeaders };
