import { patchAxios } from './instrument';

/**
 * Attaches SSR devtools request interceptors to the given axios instances.
 * Call once at module load next to `axios.create()` so the **same** bundled
 * instances your app uses get headers (webpack often ships a second `axios`
 * copy that prototype / `Module._load` patches never see).
 *
 * No-op when `window` is defined (browser).
 */
export function attachAxiosSsrDevtools(
  ...instances: Parameters<typeof patchAxios>[0][]
): void {
  if (typeof window !== 'undefined') {
    return;
  }
  for (const inst of instances) {
    patchAxios(inst);
  }
}

export { patchAxios } from './instrument';
