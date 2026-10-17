/**
 * Scene-wide effects every plugin gets for free (W-22, W-25):
 *  - the selection contour on the structure in focus (outline.ts), a thin
 *    light one under the pointer;
 *  - shadow flags: opaque structures cast and receive soft shadows, see-through
 *    shells (membranes, faces, dimmed structures) never darken what is inside.
 *
 * Works on whatever the plugin drew: meshes are matched by their concept key
 * (`userData.conceptKey` on the mesh or an ancestor), re-synced when the focus
 * changes and periodically, because models load and swap geometry over time.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, type Material, type Object3D } from 'three';
import { CONCEPT_KEY_USERDATA } from '@bilig/scene-core';
import { isOutline, outlineResolution, setOutline, type OutlineStyle } from './outline.js';

const keyOf = (o: Object3D): string | null => {
  for (let p: Object3D | null = o; p; p = p.parent) {
    const k = p.userData?.[CONCEPT_KEY_USERDATA];
    if (typeof k === 'string' && k) return k;
  }
  return null;
};

const solid = (m: Material | Material[]): boolean =>
  (Array.isArray(m) ? m : [m]).every((x) => x.visible && (!x.transparent || x.opacity >= 0.95));

export interface SceneFxProps {
  /** Structures in focus: selected, current process step, cited by the assistant. */
  focus: readonly string[];
  hover: string | null;
  /** Soft shadows between structures (off on low-power renderers). */
  shadows: boolean;
}

export function SceneFx({ focus, hover, shadows }: SceneFxProps): null {
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const frame = useRef(0);
  const sig = `${focus.join('|')}#${hover ?? ''}#${shadows}`;
  const last = useRef('');

  useEffect(() => {
    outlineResolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
  }, [size.width, size.height]);

  useFrame(() => {
    // On every change at once, otherwise twice a second (late assets, mode switches).
    if (last.current === sig && frame.current++ % 30 !== 0) return;
    last.current = sig;
    const strong = new Set(focus);
    const meshes: Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof Mesh && !isOutline(o)) meshes.push(o);
    });
    for (const m of meshes) {
      const key = keyOf(m);
      const style: OutlineStyle | null = !key ? null : strong.has(key) ? 'focus' : key === hover ? 'hover' : null;
      setOutline(m, style);
      const opaque = solid(m.material);
      m.castShadow = shadows && opaque;
      m.receiveShadow = shadows;
    }
  });

  // Leave no contours behind when the viewer (or this effect) goes away.
  useEffect(
    () => () =>
      scene.traverse((o) => {
        if (o instanceof Mesh && !isOutline(o)) setOutline(o, null);
      }),
    [scene],
  );
  return null;
}
