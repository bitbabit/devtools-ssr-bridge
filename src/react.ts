import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement
} from 'react';
import { createSsrId, DEVTOOLS_PROBE_COOKIE } from './core';

// ============================================================================
// Section 1 — SSR Debug Context
// ============================================================================

/** React context value containing SSR correlation metadata. */
export type ReactSsrDebugContextValue = {
  /** Stable SSR ID for the current render/request scope. */
  ssrId: string;
};

/** React context that carries SSR debug metadata through the tree. */
export const ReactSsrDebugContext = createContext<ReactSsrDebugContextValue | null>(null);

/**
 * Creates a context value for SSR-aware React trees.
 *
 * @param ssrId - Optional pre-existing SSR ID. A new one is generated when omitted.
 * @returns A value suitable for `ReactSsrDebugContext.Provider`.
 */
export function createReactSsrDebugValue(ssrId?: string): ReactSsrDebugContextValue {
  return {
    ssrId: ssrId ?? createSsrId()
  };
}

/**
 * Returns the current SSR ID from the nearest `ReactSsrDebugContext.Provider`,
 * or `null` when no provider is found.
 *
 * @returns The SSR correlation ID, or `null`.
 */
export function useSsrId(): string | null {
  const ctx = useContext(ReactSsrDebugContext);
  return ctx?.ssrId ?? null;
}

// ============================================================================
// Section 2 — Probe Detection Hook
// ============================================================================

/**
 * Reads a cookie by name from `document.cookie` (client-side only).
 *
 * @param name - Cookie name.
 * @returns The cookie value, or `null` if not found.
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Deletes a cookie by name (client-side only).
 *
 * @param name - Cookie name.
 */
function deleteCookie(name: string): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

/**
 * Hook that returns `true` when the `__devtools_probe` cookie is present,
 * indicating that the Chrome extension has signalled debug mode and the
 * popup should be shown.
 *
 * Automatically rechecks after mount so SSR-rendered pages pick up the
 * cookie state on hydration.
 *
 * @returns Whether the probe cookie is currently set.
 */
export function useDevToolsProbe(): boolean {
  const [probeDetected, setProbeDetected] = useState(false);

  useEffect(() => {
    setProbeDetected(getCookie(DEVTOOLS_PROBE_COOKIE) === '1');
  }, []);

  return probeDetected;
}

// ============================================================================
// Section 3 — DevTools Setup Popup Component
// ============================================================================

/** Props for the {@link DevToolsSetupPopup} component. */
export interface DevToolsSetupPopupProps {
  /**
   * API route that the popup POSTs the configuration to.
   * @default "/api/devtools/config"
   */
  configEndpoint?: string;
  /**
   * Called after the configuration has been successfully saved.
   * Useful for triggering a page reload or showing a toast.
   */
  onSaved?: () => void;
  /**
   * Called when the user dismisses the popup without saving.
   */
  onDismiss?: () => void;
  /**
   * Optional CSS class name applied to the root container.
   */
  className?: string;
  /**
   * Override the default inline styles. Pass `false` to disable
   * all built-in styles (BYO via `className`).
   */
  style?: React.CSSProperties | false;
}

/** Internal state for the popup form. */
interface PopupFormState {
  apiKey: string;
  customHeadersRaw: string;
  saving: boolean;
  error: string | null;
  success: boolean;
}

/**
 * Default inline styles for the popup container. Designed to be minimal
 * and unobtrusive — a small floating panel in the bottom-right corner.
 */
const DEFAULT_POPUP_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  zIndex: 999999,
  width: '360px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: '13px',
  backgroundColor: '#1e1e2e',
  color: '#cdd6f4',
  border: '1px solid #45475a',
  borderRadius: '8px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  padding: '16px',
  lineHeight: '1.5'
};

/** Inline styles for form inputs. */
const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  fontFamily: 'monospace',
  backgroundColor: '#313244',
  color: '#cdd6f4',
  border: '1px solid #585b70',
  borderRadius: '4px',
  outline: 'none',
  boxSizing: 'border-box'
};

/** Inline styles for primary action button. */
const BUTTON_PRIMARY_STYLE: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1e1e2e',
  backgroundColor: '#a6e3a1',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};

/** Inline styles for secondary (dismiss) button. */
const BUTTON_SECONDARY_STYLE: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#cdd6f4',
  backgroundColor: 'transparent',
  border: '1px solid #585b70',
  borderRadius: '4px',
  cursor: 'pointer'
};

/**
 * Parses a raw multi-line string into a headers object.
 *
 * Each line should be in `Header-Name: value` format.
 * Empty lines and malformed entries are silently skipped.
 *
 * @param raw - Multi-line string of headers.
 * @returns Parsed headers object.
 */
function parseCustomHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();

    if (key && value) {
      headers[key] = value;
    }
  }

  return headers;
}

/**
 * A floating popup component that appears when the Chrome extension sends
 * the debug mode signal. Prompts the user for their API key and optional
 * custom headers, then saves the configuration to a secure httpOnly cookie
 * via the config API route.
 *
 * **Rendering:** The component renders nothing when the probe cookie is
 * absent, so it is safe to include unconditionally in your layout.
 *
 * @param props - Component props.
 * @returns A React element, or `null` when the probe is not detected.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { DevToolsSetupPopup } from '@bitbabit/devtools-ssr-bridge/react';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <DevToolsSetupPopup onSaved={() => window.location.reload()} />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function DevToolsSetupPopup(props: DevToolsSetupPopupProps): ReactElement | null {
  const {
    configEndpoint = '/api/devtools/config',
    onSaved,
    onDismiss,
    className,
    style
  } = props;

  const probeDetected = useDevToolsProbe();

  const [state, setState] = useState<PopupFormState>({
    apiKey: '',
    customHeadersRaw: '',
    saving: false,
    error: null,
    success: false
  });

  /**
   * Submits the config to the API route.
   */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!state.apiKey.trim()) {
        setState((s) => ({ ...s, error: 'API key is required' }));
        return;
      }

      setState((s) => ({ ...s, saving: true, error: null }));

      try {
        const customHeaders = parseCustomHeaders(state.customHeadersRaw);

        const response = await fetch(configEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        const message = err instanceof Error ? err.message : 'Failed to save configuration';
        setState((s) => ({ ...s, saving: false, error: message }));
      }
    },
    [state.apiKey, state.customHeadersRaw, configEndpoint, onSaved]
  );

  /**
   * Dismisses the popup and clears the probe cookie.
   */
  const handleDismiss = useCallback(() => {
    deleteCookie(DEVTOOLS_PROBE_COOKIE);
    setState((s) => ({ ...s, success: false }));
    onDismiss?.();
  }, [onDismiss]);

  if (!probeDetected) {
    return null;
  }

  if (state.success) {
    const containerStyle = style === false ? undefined : { ...(style ?? DEFAULT_POPUP_STYLE) };

    return createElement(
      'div',
      { className, style: containerStyle, 'data-devtools-popup': 'success' },
      createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        createElement('span', { style: { fontSize: '18px' } }, '\u2705'),
        createElement('strong', null, 'DevTools SSR Debug Active')
      ),
      createElement(
        'p',
        { style: { margin: '0 0 12px', opacity: 0.8 } },
        'Configuration saved. SSR requests will now include debug headers.'
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: handleDismiss,
          style: BUTTON_SECONDARY_STYLE
        },
        'Dismiss'
      )
    );
  }

  const containerStyle = style === false ? undefined : { ...(style ?? DEFAULT_POPUP_STYLE) };

  return createElement(
    'div',
    { className, style: containerStyle, 'data-devtools-popup': 'config' },

    // Title
    createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
      createElement('strong', { style: { fontSize: '14px' } }, 'DevTools SSR Setup'),
      createElement(
        'button',
        {
          type: 'button',
          onClick: handleDismiss,
          style: { background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: '18px', padding: '0', lineHeight: '1' },
          'aria-label': 'Close'
        },
        '\u00D7'
      )
    ),

    createElement(
      'p',
      { style: { margin: '0 0 12px', opacity: 0.7, fontSize: '12px' } },
      'Chrome extension detected debug mode. Enter your Magento profiler API key to enable SSR request tracing.'
    ),

    // Form
    createElement(
      'form',
      { onSubmit: handleSubmit },

      // API Key field
      createElement(
        'div',
        { style: { marginBottom: '10px' } },
        createElement(
          'label',
          { style: { display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '12px' } },
          'API Key'
        ),
        createElement('input', {
          type: 'password',
          value: state.apiKey,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            setState((s) => ({ ...s, apiKey: e.target.value, error: null })),
          placeholder: 'Enter your debug API key',
          style: INPUT_STYLE,
          autoComplete: 'off',
          required: true
        })
      ),

      // Custom Headers field
      createElement(
        'div',
        { style: { marginBottom: '12px' } },
        createElement(
          'label',
          { style: { display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '12px' } },
          'Custom Headers ',
          createElement('span', { style: { fontWeight: 400, opacity: 0.6 } }, '(optional)')
        ),
        createElement('textarea', {
          value: state.customHeadersRaw,
          onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setState((s) => ({ ...s, customHeadersRaw: e.target.value })),
          placeholder: 'X-Custom-Header: value\nX-Another: value',
          rows: 3,
          style: { ...INPUT_STYLE, resize: 'vertical' as const, minHeight: '60px' }
        })
      ),

      // Error message
      state.error
        ? createElement(
          'div',
          { style: { marginBottom: '10px', color: '#f38ba8', fontSize: '12px' } },
          state.error
        )
        : null,

      // Action buttons
      createElement(
        'div',
        { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        createElement(
          'button',
          {
            type: 'button',
            onClick: handleDismiss,
            style: BUTTON_SECONDARY_STYLE
          },
          'Cancel'
        ),
        createElement(
          'button',
          {
            type: 'submit',
            disabled: state.saving,
            style: {
              ...BUTTON_PRIMARY_STYLE,
              opacity: state.saving ? 0.6 : 1,
              cursor: state.saving ? 'wait' : 'pointer'
            }
          },
          state.saving ? 'Saving...' : 'Save & Enable'
        )
      )
    )
  );
}
