/** Crystal lattice scene (TZ W-25): named parts in lattice units (nm in content). */
import { useMemo } from 'react';
import type { SceneProps } from '@bilig/scene-core';
import { PartsView } from '@bilig/scene-kit';
import { parseCrystalParams } from './lattice.js';
import { buildCrystalParts } from './build.js';

export function CrystalScene({ topic, concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const params = useMemo(() => parseCrystalParams(topic.scene.params), [topic.scene.params]);
  const parts = useMemo(() => buildCrystalParts(params, state.modes), [params, state.modes]);
  return <PartsView parts={parts} concepts={concepts} state={state} onSelectConcept={onSelectConcept} />;
}
