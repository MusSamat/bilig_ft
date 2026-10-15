/** WebGL availability (W-26): checked once; failures show the static fallback. */
let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement('canvas');
    cached = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

/** Test hook. */
export const setWebGLAvailable = (v: boolean | null): void => {
  cached = v;
};
