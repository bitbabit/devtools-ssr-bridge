"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension-align.ts
var extension_align_exports = {};
__export(extension_align_exports, {
  CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS: () => CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS,
  CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS: () => CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS
});
module.exports = __toCommonJS(extension_align_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CHROME_EXTENSION_DEFAULT_ALLOWED_PATHS,
  CHROME_EXTENSION_DEFAULT_EXCLUDED_PATHS
});
