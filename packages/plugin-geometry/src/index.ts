/** @bilig/plugin-geometry — solids with «Тело / Каркас» rendering (TZ W-23, W-25). */
import type { ModeDef, ScenePlugin } from '@bilig/scene-core';
import { GeometryScene } from './GeometryScene.js';

export * from './solids.js';
export { buildGeometryParts, renderFrom, faceOpacity, type Render } from './build.js';
export { GeometryScene } from './GeometryScene.js';

export const GEOMETRY_MODES: readonly ModeDef[] = [
  { id: 'solid', group: 'view', default: true, label: { ky: 'Тело', ru: 'Тело', en: 'Solid' } },
  { id: 'wireframe', group: 'view', label: { ky: 'Каркас', ru: 'Каркас', en: 'Wireframe' } },
];

export const geometryPlugin: ScenePlugin = {
  type: 'geometry',
  modes: () => [...GEOMETRY_MODES],
  Component: GeometryScene,
};
