import * as react from 'react';
import { ReactElement } from 'react';

/** React context value containing SSR correlation metadata. */
type ReactSsrDebugContextValue = {
    /** Stable SSR ID for the current render/request scope. */
    ssrId: string;
};
/** React context that carries SSR debug metadata through the tree. */
declare const ReactSsrDebugContext: react.Context<ReactSsrDebugContextValue | null>;
/**
 * Creates a context value for SSR-aware React trees.
 *
 * @param ssrId - Optional pre-existing SSR ID. A new one is generated when omitted.
 * @returns A value suitable for `ReactSsrDebugContext.Provider`.
 */
declare function createReactSsrDebugValue(ssrId?: string): ReactSsrDebugContextValue;
/**
 * Returns the current SSR ID from the nearest `ReactSsrDebugContext.Provider`,
 * or `null` when no provider is found.
 *
 * @returns The SSR correlation ID, or `null`.
 */
declare function useSsrId(): string | null;
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
declare function useDevToolsProbe(): boolean;
/** Props for the {@link DevToolsSetupPopup} component. */
interface DevToolsSetupPopupProps {
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
declare function DevToolsSetupPopup(props: DevToolsSetupPopupProps): ReactElement | null;

export { DevToolsSetupPopup, type DevToolsSetupPopupProps, ReactSsrDebugContext, type ReactSsrDebugContextValue, createReactSsrDebugValue, useDevToolsProbe, useSsrId };
