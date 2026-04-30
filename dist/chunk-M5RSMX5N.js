// src/extension-align.ts
var CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS = [
  "/rest/V",
  "/graphql",
  "/api/",
  "/section/load"
];
var CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS = [
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf"
];

export {
  CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS,
  CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS
};
