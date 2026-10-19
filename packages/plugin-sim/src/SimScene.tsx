/**
 * Simulation scene (TZ W-25): builds named parts for the scene's model and
 * drives them with the model clock — the process playback when a process runs,
 * otherwise a free clock that stands still under reduced motion.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SceneProps } from '@bilig/scene-core';
import { PartsView, bindParts } from '@bilig/scene-kit';
import { modelFor } from './models.js';

export function SimScene({ topic, concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const raw = useMemo(() => (topic.scene.params ?? {}) as Record<string, unknown>, [topic.scene.params]);
  const model = modelFor(raw);
  const pb = state.process;
  // Rebuild only when modes or the discrete step change (motion handles the rest).
  const stepIndex = pb?.stepIndex;
  const hasProcess = !!pb;
  const lang = state.lang;
  // Selection-aware models (food tests on the selected food) rebuild when the selection changes.
  const selectedKey = model.usesSelection ? state.selectedConceptKey : null;
  const parts = useMemo(
    () => {
      const ctx = { modes: state.modes, playback: pb, lang };
      const first = model.build(raw, ctx);
      if (!selectedKey) return first;
      const binding = bindParts(first, concepts);
      const selected = new Set(first.filter((p) => binding.get(p.name) === selectedKey).map((p) => p.name));
      return model.build(raw, { ...ctx, selected });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, raw, state.modes, stepIndex, hasProcess, lang, selectedKey, concepts],
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
