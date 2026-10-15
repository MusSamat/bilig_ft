/**
 * @bilig/plugin-gltf — GLB scenes with node→concept masks (TZ W-20..W-26).
 * Without a loadable asset it renders a procedural scene named by the same masks.
 */
import type { ModeDef, ScenePlugin } from '@bilig/scene-core';
import { makeGltfScene, type GltfPluginOptions } from './GltfScene.js';

export type { GltfPluginOptions } from './GltfScene.js';
export * from './layout.js';

export const GLTF_MODES: readonly ModeDef[] = [
  { id: 'whole', group: 'view', default: true, label: { ky: 'Толугу менен', ru: 'Целиком', en: 'Whole' } },
  { id: 'section', group: 'view', label: { ky: 'Кесилиш', ru: 'Разрез', en: 'Section' } },
];

export function createGltfPlugin(opts: GltfPluginOptions = {}): ScenePlugin {
  return { type: 'gltf', modes: () => [...GLTF_MODES], Component: makeGltfScene(opts) };
}

export const gltfPlugin: ScenePlugin = createGltfPlugin();
