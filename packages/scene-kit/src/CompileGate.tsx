/**
 * Shader warm-up without freezing the page (W-26). three.js compiles a
 * material's program the first time it draws it, and reading the link status
 * blocks the main thread — seconds on a software rasteriser. CompileGate keeps
 * its subtree hidden, compiles it with `renderer.compileAsync` (non-blocking
 * with KHR_parallel_shader_compile; otherwise checked between frames), then
 * shows it. Plugins wrap content that arrives later (a loaded GLB) the same way.
 */
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three';

let compiling = 0;
const listeners = new Set<() => void>();
const bump = (d: number) => {
  compiling = Math.max(0, compiling + d);
  listeners.forEach((l) => l());
};

/** True while any CompileGate is compiling (the viewer shows its «preparing» state). */
export function useShadersCompiling(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => compiling > 0,
    () => false,
  );
}

export function CompileGate({ children, onReady }: { children: ReactNode; onReady?(): void }): JSX.Element {
  const ref = useRef<Group>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const ready = useRef(onReady);
  ready.current = onReady;
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    let alive = true;
    group.visible = false;
    bump(1);
    const show = () => {
      if (!alive) return;
      alive = false;
      group.visible = true;
      bump(-1);
      invalidate();
      ready.current?.();
    };
    // compile() walks hidden objects too; lights come from the scene the group lives in.
    gl.compileAsync(group, camera, scene).then(show, show);
    return () => {
      if (alive) {
        alive = false;
        bump(-1);
      }
      group.visible = true;
    };
  }, [gl, camera, scene, invalidate]);
  return <group ref={ref}>{children}</group>;
}
