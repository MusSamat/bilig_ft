/// <reference lib="webworker" />
/** WebGL probe off the main thread (see webgl.ts): creates one context on an OffscreenCanvas and reports the renderer. */
let available = false;
let renderer = '';
try {
  const c = new OffscreenCanvas(1, 1);
  const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
  if (gl) {
    available = true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
} catch {
  available = false;
}
(self as unknown as DedicatedWorkerGlobalScope).postMessage({ available, renderer });
