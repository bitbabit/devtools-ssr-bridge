/**
 * App Router SSR correlation — server-only (do not import from client components).
 */
import 'server-only';
import {
  isValidForwardedSsrId,
  SSR_ID_HEADER,
  SSR_ID_REQUEST_HEADER
} from './core';
import { pinSsrIdForRequest } from './ssr-id-store';

const MIDDLEWARE_SSR_HEADER_NAMES = [
  SSR_ID_REQUEST_HEADER,
  'x-ssr-id',
  SSR_ID_HEADER,
  'x-middleware-request-x-devtools-ssr-id'
] as const;

async function readSsrIdFromHeaders(): Promise<string | null> {
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
        pinSsrIdForRequest(raw);
        return raw;
      }
    }
  } catch {
    // outside App Router / build
  }
  return null;
}

/**
 * Reads the SSR id forwarded from middleware into this RSC request.
 */
export async function readSsrIdFromAppRouterHeaders(): Promise<string | null> {
  return readSsrIdFromHeaders();
}

/**
 * Call at the top of root layout before any Magento axios/fetch.
 */
export async function bindDevtoolsSsrCorrelation(): Promise<string | null> {
  return readSsrIdFromHeaders();
}
