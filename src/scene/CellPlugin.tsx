/**
 * A generic, data-driven scene plugin that renders any topic's concepts as 3D
 * structures without needing a real GLB asset (procedural MVP). It demonstrates
 * the engine contract: concepts become meshes; clicks resolve through the shared
 * container-aware picker (TZ W-21); labels/section are data-driven modes (W-23).
 *
 * Registered under the `glb` plugin type so the biology fixture renders; the
 * real GLB loader will replace the procedural geometry behind the same contract.
 */
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Concept } from '@bilig/content-model';
import { t } from '@bilig/content-model';
import {
  hueFor,
  pickConcept,
  type Hit,
  type ModeDef,
  type ScenePlugin,
  type SceneProps,
} from '@bilig/scene-core';

const RING_RADIUS = 1.6;
const SHELL_RADIUS = 2.3;

/** Deterministic position for each concept: anchor if given, else on a ring. */
function layout(concepts: Concept[]): Map<string, [number, number, number]> {
  const pos = new Map<string, [number, number, number]>();
  const anchorless = concepts.filter((c) => !c.container && !c.anchor);
  let i = 0;
  for (const c of concepts) {
    if (c.container) {
      pos.set(c.id, [0, 0, 0]);
    } else if (c.anchor) {
      pos.set(c.id, c.anchor);
    } else {
      const angle = (i / Math.max(1, anchorless.length)) * Math.PI * 2;
      pos.set(c.id, [
        Math.cos(angle) * RING_RADIUS,
        i % 2 === 0 ? 0.5 : -0.5,
        Math.sin(angle) * RING_RADIUS,
      ]);
      i += 1;
    }
  }
  return pos;
}

function CellScene({ scene, concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const positions = useMemo(() => layout(concepts), [concepts]);
  const showLabels = !!state.modes.labels;
  const section = !!state.modes.section;

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    const hits: Hit[] = e.intersections
      .map((i) => ({
        conceptId: (i.object.userData as { conceptId?: string }).conceptId ?? '',
        distance: i.distance,
      }))
      .filter((h) => h.conceptId);
    onSelectConcept(pickConcept(hits, concepts));
  };

  return (
    <group onClick={handleClick}>
      {concepts.map((c) => {
        const [x, y, z] = positions.get(c.id) ?? [0, 0, 0];
        const override = scene.overrides?.[c.id];
        const hue = hueFor(c, c.container ? 200 : 150, override);
        const color = `hsl(${hue} 70% 60%)`;
        const selected = state.selectedConceptId === c.id;
        const radius = c.container ? SHELL_RADIUS : 0.5;
        return (
          <group key={c.id} position={[x, y, z]}>
            <mesh
              userData={{ conceptId: c.id }}
              scale={selected ? 1.15 : 1}
              onPointerOver={() => (document.body.style.cursor = 'pointer')}
              onPointerOut={() => (document.body.style.cursor = 'default')}
            >
              <sphereGeometry args={[radius, 48, 48]} />
              <meshStandardMaterial
                color={color}
                // Shells are translucent so they never visually (or via raycast)
                // block the inner structures (TZ W-21).
                transparent={c.container}
                opacity={c.container ? (section ? 0.12 : 0.22) : 1}
                emissive={color}
                emissiveIntensity={selected ? 0.5 : 0.08}
                roughness={0.45}
                metalness={0.05}
              />
            </mesh>
            {showLabels && !c.container && (
              <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                <span className="scene-label" style={{ ['--dot' as string]: color }}>
                  {t(c.title, state.lang)}
                </span>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

export const cellPlugin: ScenePlugin = {
  type: 'glb',
  modesFor: (scene): ModeDef[] =>
    scene.modes.includes('section')
      ? [{ id: 'section', group: 'representation', label: { ky: 'Кесилиш', ru: 'Разрез', en: 'Section' } }]
      : [],
  Component: CellScene,
};
