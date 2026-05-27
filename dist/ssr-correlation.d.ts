/**
 * App Router SSR correlation — server-only (do not import from client components).
 */

/**
 * Reads the SSR id forwarded from middleware into this RSC request.
 */
declare function readSsrIdFromAppRouterHeaders(): Promise<string | null>;
/**
 * Call at the top of root layout before any Magento axios/fetch.
 */
declare function bindDevtoolsSsrCorrelation(): Promise<string | null>;

export { bindDevtoolsSsrCorrelation, readSsrIdFromAppRouterHeaders };
