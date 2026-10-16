/** WebGL availability (W-26): checked once; failures show the static fallback. */
let cached: boolean | null = null;
let software: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    cached = !!gl;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      software = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(name);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Software rasteriser (no GPU — common on old school PCs, VMs and CI): the
 * viewer drops MSAA and caps the resolution so the page stays responsive.
 */
export function isSoftwareGL(): boolean {
  if (software === null) hasWebGL();
  return !!software;
}

/** Test hook. */
export const setWebGLAvailable = (v: boolean | null): void => {
  cached = v;
};
