import { DEVTOOLS_CONFIG_TTL } from './core';
import { createDevToolsConfigHandler } from './next';

/**
 * Re-export for `app/api/devtools/config/route.js` — httpOnly `__devtools_config`
 * (Chrome extension POST / same origin). Cookie TTL matches {@link DEVTOOLS_CONFIG_TTL}.
 */
export const { POST, DELETE } = createDevToolsConfigHandler({
  configTtl: DEVTOOLS_CONFIG_TTL
});
