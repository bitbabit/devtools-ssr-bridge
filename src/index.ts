/**
 * Entry exports for @bitbabit/devtools-ssr-bridge.
 *
 * Prefer subpath imports (`/next`, `/react`, `/instrument`) where clarity matters.
 */
export * from './core';
export * from './extension-align';
export * from './next';
export * from './react';
export * from './instrument';
export {
  bindDevtoolsSsrCorrelation,
  readSsrIdFromAppRouterHeaders
} from './ssr-correlation';

