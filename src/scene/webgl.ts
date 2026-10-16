/**
 * WebGL availability and software-rasteriser detection (W-26).
 *
 * Creating the first WebGL context starts the browser's GPU process; with a
 * software rasteriser (old school PCs, VMs, CI) that alone can block the main
 * thread for seconds, and a throwaway probe context pays that twice. So the
 * page never probes on the main thread: `probeWebGL()` asks a worker
 * (OffscreenCanvas). Where a worker cannot tell (no WebGL in workers), WebGL is
 * assumed and the viewer's real renderer is the probe: a failed context lands
 * in the stage's error boundary, and the viewer reports a software renderer
 * via `reportRenderer()`. The topic page starts the probe with the package request.
 */
import { useEffect, useSyncExternalStore } from 'react';

export interface WebGLSupport {
  available: boolean;
  /** Software rasteriser: the viewer drops MSAA and caps the resolution so the page stays responsive. */
  software: boolean;
}

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
/** A worker that never answers (blocked, crashed) must not leave the stage on its loader. */
const WORKER_TIMEOUT_MS = 15_000;

let result: WebGLSupport | null = null;
let pending: Promise<WebGLSupport> | null = null;
const listeners = new Set<() => void>();

function settle(r: WebGLSupport): WebGLSupport {
  result = r;
  listeners.forEach((l) => l());
  return r;
}

export const isSoftwareRenderer = (name: string): boolean => SOFTWARE_RE.test(name);

/** The worker's answer, or null when workers / WebGL in workers are unavailable. */
function probeInWorker(): Promise<WebGLSupport | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./webgl-probe.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(null);
      return;
    }
    const done = (r: WebGLSupport | null) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => done(null), WORKER_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<{ available: boolean; renderer?: string }>) =>
      // "unavailable" in a worker may only mean no WebGL in OffscreenCanvas (older Safari): let the viewer try.
      done(e.data.available ? { available: true, software: SOFTWARE_RE.test(e.data.renderer ?? '') } : null);
    worker.onerror = () => done(null);
  });
}

/** Start (or join) the probe. Never blocks rendering. */
export function probeWebGL(): Promise<WebGLSupport> {
  if (result) return Promise.resolve(result);
  pending ??= probeInWorker().then((r) => settle(r ?? { available: true, software: false }));
  return pending;
}

/** The probe result once known (null while it runs); starts the probe. */
export function useWebGLSupport(): WebGLSupport | null {
  const r = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => result,
    () => null,
  );
  useEffect(() => {
    if (!r) void probeWebGL();
  }, [r]);
  return r;
}

/** The viewer's real renderer: corrects `software` when the worker could not tell. */
export function reportRenderer(name: string): void {
  const software = isSoftwareRenderer(name);
  if (result && result.software !== software) settle({ ...result, software });
}

/** Sync read for code that runs after the probe (the viewer); false while unknown. */
export function isSoftwareGL(): boolean {
  return !!result?.software;
}

/** Test hook: `true` / `false` fixes the result, `null` resets it. */
export const setWebGLAvailable = (v: boolean | null): void => {
  pending = null;
  if (v === null) result = null;
  else settle({ available: v, software: false });
};
