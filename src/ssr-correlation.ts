/**
 * App Router SSR correlation — call {@link bindDevtoolsSsrCorrelation} once per
 * request tree (e.g. root layout) so all parallel axios/fetch calls share the
 * middleware `x-devtools-ssr-id` / `X-SSR-ID`.
 */
import { cache } from 'react';
import {
  isValidForwardedSsrId,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER
} from './core';

const MIDDLEWARE_SSR_HEADER_NAMES = [
  SSR_ID_REQUEST_HEADER,
  'x-ssr-id',
  SSR_ID_HEADER,
  'x-middleware-request-x-devtools-ssr-id'
] as const;

/**
 * Reads the SSR id forwarded from middleware into this RSC request.
 */
export const readSsrIdFromAppRouterHeaders = cache(async (): Promise<string | null> => {
  try {
    if (typeof require === 'undefined') {
      return null;
    }
    const { headers: headersFn } = require('next/headers') as {
      headers: () => Promise<{ get: (name: string) => string | null }>;
    };
    const store = await Promise.resolve(headersFn());
    for (const name of MIDDLEWARE_SSR_HEADER_NAMES) {
      const raw = store.get(name);
      if (raw && isValidForwardedSsrId(raw)) {
        return raw;
      }
    }
  } catch {
    // outside App Router
  }
  return null;
});

/**
 * Resolves the SSR id middleware forwarded into this RSC request. Call at the top
 * of root `layout.jsx` / `layout.tsx` before any Magento `axios` / `fetch`.
 */
export const bindDevtoolsSsrCorrelation = cache(async (): Promise<string | null> => {
  return readSsrIdFromAppRouterHeaders();
});
