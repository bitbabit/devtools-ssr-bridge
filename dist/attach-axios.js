import {
  patchAxios
} from "./chunk-OUYSQ7WE.js";
import "./chunk-SGMY5LZY.js";
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
