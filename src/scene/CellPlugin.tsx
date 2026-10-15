/**
 * A generic, data-driven scene plugin that renders a topic's concepts as 3D
 * structures without a real GLB (procedural MVP). Clicks resolve through the
 * shared container-aware picker (W-21); modes are data-driven (W-23).
 *
 * Registered under the `gltf` kind; the real GLB loader will replace the
 * procedural geometry behind the same contract.
 */
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { t, type ResolvedConcept, type Vec3 } from '@bilig/content-model';
import { pickConcept, type Hit, type ModeDef, type ScenePlugin, type SceneProps } from '@bilig/scene-core';

const RING_RADIUS = 1.6;
const SHELL_RADIUS = 2.3;

/** Deterministic position for each concept: override anchor if given, else on a ring. */
function layout(concepts: ResolvedConcept[]): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  const anchorless = concepts.filter((c) => !c.isContainer && !c.anchor);
  let i = 0;
  for (const c of concepts) {
    if (c.isContainer) {
      pos.set(c.key, [0, 0, 0]);
    } else if (c.anchor) {
      pos.set(c.key, c.anchor);
    } else {
      const angle = (i / Math.max(1, anchorless.length)) * Math.PI * 2;
      pos.set(c.key, [Math.cos(angle) * RING_RADIUS, i % 2 === 0 ? 0.5 : -0.5, Math.sin(angle) * RING_RADIUS]);
      i += 1;
    }
  }
  return pos;
}

function CellScene({ concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const positions = useMemo(() => layout(concepts), [concepts]);
  const showLabels = !!state.modes.labels;
  const section = state.modes.view === 'section';

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    const hits: Hit[] = e.intersections
      .map((i) => ({
        conceptKey: (i.object.userData as { conceptKey?: string }).conceptKey ?? '',
        distance: i.distance,
      }))
      .filter((h) => h.conceptKey);
    onSelectConcept(pickConcept(hits, concepts));
  };

  return (
    <group onClick={handleClick}>
      {concepts.map((c) => {
        const [x, y, z] = positions.get(c.key) ?? [0, 0, 0];
        const color = `hsl(${c.hue} 70% 60%)`;
        const selected = state.selectedConceptKey === c.key;
        const radius = c.isContainer ? SHELL_RADIUS : 0.5;
        return (
          <group key={c.key} position={[x, y, z]}>
            <mesh
              userData={{ conceptKey: c.key }}
              scale={selected ? 1.15 : 1}
              onPointerOver={() => (document.body.style.cursor = 'pointer')}
              onPointerOut={() => (document.body.style.cursor = 'default')}
            >
              <sphereGeometry args={[radius, 48, 48]} />
              <meshStandardMaterial
                color={color}
                transparent={c.isContainer}
                opacity={c.isContainer ? (section ? 0.12 : 0.22) : 1}
                emissive={color}
                emissiveIntensity={selected ? 0.5 : 0.08}
                roughness={0.45}
                metalness={0.05}
              />
            </mesh>
            {showLabels && !c.isContainer && (
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

const MODES: ModeDef[] = [
  { id: 'whole', group: 'view', default: true, label: { ky: 'Толугу менен', ru: 'Целиком', en: 'Whole' } },
  { id: 'section', group: 'view', label: { ky: 'Кесилиш', ru: 'Разрез', en: 'Section' } },
];

export const cellPlugin: ScenePlugin = {
  type: 'gltf',
  modes: () => MODES,
  Component: CellScene,
};
