/**
 * Molecule generator scene (TZ W-23 «Шаростержневая / Объёмная», «Электронные
 * оболочки»; W-25 animated electrons). Scene units are ångström (nm for the
 * DNA preset), matching the topic camera and anchors.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SceneProps } from '@bilig/scene-core';
import { PartsView } from '@bilig/scene-kit';
import { parseMoleculeParams } from './params.js';
import { buildMoleculeParts } from './build.js';

export function MoleculeScene({ topic, concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const params = useMemo(() => parseMoleculeParams(topic.scene.params), [topic.scene.params]);
  const animate = !state.reducedMotion;
  const parts = useMemo(() => buildMoleculeParts(params, { modes: state.modes, concepts, animate }), [params, state.modes, concepts, animate]);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (animate) clock.current += Math.min(dt, 0.1);
  });
  return <PartsView parts={parts} concepts={concepts} state={state} onSelectConcept={onSelectConcept} time={clock} />;
}
