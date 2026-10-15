/** Geometry generator scene (TZ W-23 «Тело / Каркас»): named faces, edges, vertices, guides. */
import { useMemo } from 'react';
import type { SceneProps } from '@bilig/scene-core';
import { PartsView } from '@bilig/scene-kit';
import { parseGeometryParams } from './solids.js';
import { buildGeometryParts, faceOpacity, renderFrom } from './build.js';

export function GeometryScene({ topic, concepts, state, onSelectConcept }: SceneProps): JSX.Element {
  const parts = useMemo(() => buildGeometryParts(parseGeometryParams(topic.scene.params)), [topic.scene.params]);
  return <PartsView parts={parts} concepts={concepts} state={state} onSelectConcept={onSelectConcept} containerOpacity={faceOpacity(renderFrom(state.modes))} />;
}
