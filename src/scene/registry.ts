/**
 * Scene plugins are registered from a lazily-loaded chunk (three.js, r3f and
 * the plugins are not part of the initial bundle — §10). The topic page waits
 * for `ensurePlugins()` before resolving modes and readouts.
 */
import { create } from 'zustand';

export const usePluginsReady = create<{ ready: boolean; failed: boolean }>(() => ({ ready: false, failed: false }));

let loading: Promise<void> | null = null;

export function ensurePlugins(): Promise<void> {
  loading ??= import('./plugins')
    .then((m) => {
      m.registerPlugins();
      usePluginsReady.setState({ ready: true });
    })
    .catch(() => {
      loading = null;
      usePluginsReady.setState({ failed: true });
    });
  return loading;
}
