/**
 * Simulation scene (TZ W-25): builds named parts for the scene's model and
 * drives them with the model clock — the process playback when a process runs,
 * otherwise a free clock that stands still under reduced motion.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SceneProps } from '@bilig/scene-core';
import { PartsView } from '@bilig/scene-kit';
import { modelFor } from './models.js';

export function SimScene({ topic, concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const raw = useMemo(() => (topic.scene.params ?? {}) as Record<string, unknown>, [topic.scene.params]);
  const model = modelFor(raw);
  const pb = state.process;
  // Rebuild only when modes or the discrete step change (motion handles the rest).
  const stepIndex = pb?.stepIndex;
  const hasProcess = !!pb;
  const parts = useMemo(
    () => model.build(raw, { modes: state.modes, playback: pb }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, raw, state.modes, stepIndex, hasProcess],
  );
  const latest = useRef(pb);
  latest.current = pb;
  const free = useRef(0);
  const clock = useRef(0);
  const animate = !state.reducedMotion;

  useFrame((_, dt) => {
    if (!latest.current && animate) free.current += Math.min(dt, 0.1);
    clock.current = model.clock(raw, latest.current, free.current);
  });

  const sun = model.sunAt?.(raw);
  return (
    <>
      {sun && <pointLight name="SunLight" position={sun} intensity={60} decay={1.2} distance={0} color="#fff4d6" />}
      <PartsView parts={parts} concepts={concepts} state={state} onSelectConcept={onSelectConcept} time={clock} />
    </>
  );
}
