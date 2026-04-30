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

// src/react.ts
var react_exports = {};
__export(react_exports, {
  DevToolsSetupPopup: () => DevToolsSetupPopup,
  ReactSsrDebugContext: () => ReactSsrDebugContext,
  createReactSsrDebugValue: () => createReactSsrDebugValue,
  useDevToolsProbe: () => useDevToolsProbe,
  useSsrId: () => useSsrId
});
module.exports = __toCommonJS(react_exports);
var import_react = require("react");

// src/core.ts
var DEVTOOLS_PROBE_COOKIE = "__devtools_probe";
var DEVTOOLS_CONFIG_TTL = 6 * 60 * 60;
function createSsrId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// src/react.ts
var ReactSsrDebugContext = (0, import_react.createContext)(null);
function createReactSsrDebugValue(ssrId) {
  return {
    ssrId: ssrId ?? createSsrId()
  };
}
function useSsrId() {
  const ctx = (0, import_react.useContext)(ReactSsrDebugContext);
  return ctx?.ssrId ?? null;
}
function getCookie(name) {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function deleteCookie(name) {
  if (typeof document !== "undefined") {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}
function useDevToolsProbe() {
  const [probeDetected, setProbeDetected] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    setProbeDetected(getCookie(DEVTOOLS_PROBE_COOKIE) === "1");
  }, []);
  return probeDetected;
}
var DEFAULT_POPUP_STYLE = {
  position: "fixed",
  bottom: "20px",
  right: "20px",
  zIndex: 999999,
  width: "360px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: "13px",
  backgroundColor: "#1e1e2e",
  color: "#cdd6f4",
  border: "1px solid #45475a",
  borderRadius: "8px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  padding: "16px",
  lineHeight: "1.5"
};
var INPUT_STYLE = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "13px",
  fontFamily: "monospace",
  backgroundColor: "#313244",
  color: "#cdd6f4",
  border: "1px solid #585b70",
  borderRadius: "4px",
  outline: "none",
  boxSizing: "border-box"
};
var BUTTON_PRIMARY_STYLE = {
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#1e1e2e",
  backgroundColor: "#a6e3a1",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};
var BUTTON_SECONDARY_STYLE = {
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#cdd6f4",
  backgroundColor: "transparent",
  border: "1px solid #585b70",
  borderRadius: "4px",
  cursor: "pointer"
};
function parseCustomHeaders(raw) {
  const headers = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) continue;
    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  }
  return headers;
}
function DevToolsSetupPopup(props) {
  const {
    configEndpoint = "/api/devtools/config",
    onSaved,
    onDismiss,
    className,
    style
  } = props;
  const probeDetected = useDevToolsProbe();
  const [state, setState] = (0, import_react.useState)({
    apiKey: "",
    customHeadersRaw: "",
    saving: false,
    error: null,
    success: false
  });
  const handleSubmit = (0, import_react.useCallback)(
    async (e) => {
      e.preventDefault();
      if (!state.apiKey.trim()) {
        setState((s) => ({ ...s, error: "API key is required" }));
        return;
      }
      setState((s) => ({ ...s, saving: true, error: null }));
      try {
        const customHeaders = parseCustomHeaders(state.customHeadersRaw);
        const response = await fetch(configEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: state.apiKey.trim(), customHeaders })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Server responded with ${response.status}`);
        }
        deleteCookie(DEVTOOLS_PROBE_COOKIE);
        setState((s) => ({ ...s, saving: false, success: true }));
        onSaved?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save configuration";
        setState((s) => ({ ...s, saving: false, error: message }));
      }
    },
    [state.apiKey, state.customHeadersRaw, configEndpoint, onSaved]
  );
  const handleDismiss = (0, import_react.useCallback)(() => {
    deleteCookie(DEVTOOLS_PROBE_COOKIE);
    setState((s) => ({ ...s, success: false }));
    onDismiss?.();
  }, [onDismiss]);
  if (!probeDetected) {
    return null;
  }
  if (state.success) {
    const containerStyle2 = style === false ? void 0 : { ...style ?? DEFAULT_POPUP_STYLE };
    return (0, import_react.createElement)(
      "div",
      { className, style: containerStyle2, "data-devtools-popup": "success" },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" } },
        (0, import_react.createElement)("span", { style: { fontSize: "18px" } }, "\u2705"),
        (0, import_react.createElement)("strong", null, "DevTools SSR Debug Active")
      ),
      (0, import_react.createElement)(
        "p",
        { style: { margin: "0 0 12px", opacity: 0.8 } },
        "Configuration saved. SSR requests will now include debug headers."
      ),
      (0, import_react.createElement)(
        "button",
        {
          type: "button",
          onClick: handleDismiss,
          style: BUTTON_SECONDARY_STYLE
        },
        "Dismiss"
      )
    );
  }
  const containerStyle = style === false ? void 0 : { ...style ?? DEFAULT_POPUP_STYLE };
  return (0, import_react.createElement)(
    "div",
    { className, style: containerStyle, "data-devtools-popup": "config" },
    // Title
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
      (0, import_react.createElement)("strong", { style: { fontSize: "14px" } }, "DevTools SSR Setup"),
      (0, import_react.createElement)(
        "button",
        {
          type: "button",
          onClick: handleDismiss,
          style: { background: "none", border: "none", color: "#6c7086", cursor: "pointer", fontSize: "18px", padding: "0", lineHeight: "1" },
          "aria-label": "Close"
        },
        "\xD7"
      )
    ),
    (0, import_react.createElement)(
      "p",
      { style: { margin: "0 0 12px", opacity: 0.7, fontSize: "12px" } },
      "Chrome extension detected debug mode. Enter your Magento profiler API key to enable SSR request tracing."
    ),
    // Form
    (0, import_react.createElement)(
      "form",
      { onSubmit: handleSubmit },
      // API Key field
      (0, import_react.createElement)(
        "div",
        { style: { marginBottom: "10px" } },
        (0, import_react.createElement)(
          "label",
          { style: { display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "12px" } },
          "API Key"
        ),
        (0, import_react.createElement)("input", {
          type: "password",
          value: state.apiKey,
          onChange: (e) => setState((s) => ({ ...s, apiKey: e.target.value, error: null })),
          placeholder: "Enter your debug API key",
          style: INPUT_STYLE,
          autoComplete: "off",
          required: true
        })
      ),
      // Custom Headers field
      (0, import_react.createElement)(
        "div",
        { style: { marginBottom: "12px" } },
        (0, import_react.createElement)(
          "label",
          { style: { display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "12px" } },
          "Custom Headers ",
          (0, import_react.createElement)("span", { style: { fontWeight: 400, opacity: 0.6 } }, "(optional)")
        ),
        (0, import_react.createElement)("textarea", {
          value: state.customHeadersRaw,
          onChange: (e) => setState((s) => ({ ...s, customHeadersRaw: e.target.value })),
          placeholder: "X-Custom-Header: value\nX-Another: value",
          rows: 3,
          style: { ...INPUT_STYLE, resize: "vertical", minHeight: "60px" }
        })
      ),
      // Error message
      state.error ? (0, import_react.createElement)(
        "div",
        { style: { marginBottom: "10px", color: "#f38ba8", fontSize: "12px" } },
        state.error
      ) : null,
      // Action buttons
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
        (0, import_react.createElement)(
          "button",
          {
            type: "button",
            onClick: handleDismiss,
            style: BUTTON_SECONDARY_STYLE
          },
          "Cancel"
        ),
        (0, import_react.createElement)(
          "button",
          {
            type: "submit",
            disabled: state.saving,
            style: {
              ...BUTTON_PRIMARY_STYLE,
              opacity: state.saving ? 0.6 : 1,
              cursor: state.saving ? "wait" : "pointer"
            }
          },
          state.saving ? "Saving..." : "Save & Enable"
        )
      )
    )
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DevToolsSetupPopup,
  ReactSsrDebugContext,
  createReactSsrDebugValue,
  useDevToolsProbe,
  useSsrId
});
