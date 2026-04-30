/**
 * Re-export for `app/api/devtools/config/route.js` — httpOnly `__devtools_config`
 * (Chrome extension POST / same origin). Cookie TTL matches {@link DEVTOOLS_CONFIG_TTL}.
 */
declare const POST: (request: Request) => Promise<Response>;
declare const DELETE: () => Promise<Response>;

export { DELETE, POST };
