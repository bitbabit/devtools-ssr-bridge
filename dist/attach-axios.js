import {
  patchAxios
} from "./chunk-HMRQSX5S.js";
import "./chunk-VGQOXZUY.js";
import "./chunk-DBLTRXN2.js";
import "./chunk-3RG5ZIWI.js";

// src/attach-axios.ts
function attachAxiosSsrDevtools(...instances) {
  if (typeof window !== "undefined") {
    return;
  }
  for (const inst of instances) {
    patchAxios(inst);
  }
}
export {
  attachAxiosSsrDevtools,
  patchAxios
};
