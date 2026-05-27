/**
 * Shared SSR id store for middleware → RSC → axios (no React / instrument cycles).
 */
import { isValidForwardedSsrId } from './core';

type SsrIdAls = {
  getStore(): string | undefined;
  enterWith(value: string): void;
};

let activeSsrIdAls: SsrIdAls | null | undefined;

function getAls(): SsrIdAls | null {
  if (activeSsrIdAls !== undefined) {
    return activeSsrIdAls;
  }

  if (typeof require === 'undefined') {
    activeSsrIdAls = null;
    return null;
  }

  try {
    const { AsyncLocalStorage } = require('node:async_hooks') as {
      AsyncLocalStorage: new () => SsrIdAls;
    };
    activeSsrIdAls = new AsyncLocalStorage();
    return activeSsrIdAls;
  } catch {
    activeSsrIdAls = null;
    return null;
  }
}

export function pinSsrIdForRequest(ssrId: string): void {
  if (!isValidForwardedSsrId(ssrId)) {
    return;
  }
  getAls()?.enterWith(ssrId);
}

export function getPinnedSsrId(): string | undefined {
  const id = getAls()?.getStore();
  return id && isValidForwardedSsrId(id) ? id : undefined;
}
