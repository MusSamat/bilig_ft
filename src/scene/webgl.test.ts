// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSoftwareGL, probeWebGL, reportRenderer, setWebGLAvailable } from './webgl';

/** A Worker stand-in that answers like webgl-probe.worker.ts (or never, with `reply: null`). */
function stubWorker(reply: { available: boolean; renderer?: string } | null) {
  const created: string[] = [];
  class FakeWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    terminate = vi.fn();
    constructor(url: URL) {
      created.push(String(url));
      if (reply) setTimeout(() => this.onmessage?.({ data: reply } as MessageEvent), 0);
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('OffscreenCanvas', class {});
  return created;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setWebGLAvailable(null);
});

describe('probeWebGL (never on the main thread during render)', () => {
  it('asks the worker and detects a software rasteriser', async () => {
    const created = stubWorker({ available: true, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' });
    await expect(probeWebGL()).resolves.toEqual({ available: true, software: true });
    expect(created).toHaveLength(1);
    expect(created[0]).toContain('webgl-probe.worker');
    expect(isSoftwareGL()).toBe(true);
  });

  it('a hardware renderer is not software; the result is cached', async () => {
    const created = stubWorker({ available: true, renderer: 'ANGLE (NVIDIA GeForce GTX 1650)' });
    await expect(probeWebGL()).resolves.toEqual({ available: true, software: false });
    await probeWebGL();
    expect(created).toHaveLength(1);
  });

  it('no WebGL in the worker → assumed available, with no main-thread probe', async () => {
    stubWorker({ available: false });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    await expect(probeWebGL()).resolves.toEqual({ available: true, software: false });
    expect(getContext).not.toHaveBeenCalled();
  });

  it('without Worker / OffscreenCanvas the viewer\'s renderer decides; it reports software rendering', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    await expect(probeWebGL()).resolves.toEqual({ available: true, software: false });
    expect(getContext).not.toHaveBeenCalled();
    reportRenderer('llvmpipe (LLVM 15.0.7, 256 bits)');
    expect(isSoftwareGL()).toBe(true);
  });

  it('a worker that never answers does not leave the stage loading forever', async () => {
    vi.useFakeTimers();
    stubWorker(null);
    const p = probeWebGL();
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(p).resolves.toEqual({ available: true, software: false });
  });
});
