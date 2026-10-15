/** @bilig/plugin-molecule — ball-and-stick / space-filling molecules with electron shells (TZ W-23, W-25). */
import type { ModeDef, ScenePlugin } from '@bilig/scene-core';
import { MoleculeScene } from './MoleculeScene.js';

export * from './elements.js';
export * from './params.js';
export * from './build.js';
export { MoleculeScene } from './MoleculeScene.js';

export const MOLECULE_MODES: readonly ModeDef[] = [
  { id: 'ball-stick', group: 'rep', default: true, label: { ky: 'Шар-таякча', ru: 'Шаростержневая', en: 'Ball-and-stick' } },
  { id: 'spacefill', group: 'rep', label: { ky: 'Көлөмдүү', ru: 'Объёмная', en: 'Space-filling' } },
  { id: 'shells', label: { ky: 'Электрон кабыктары', ru: 'Электронные оболочки', en: 'Electron shells' } },
];

export const moleculePlugin: ScenePlugin = {
  type: 'molecule',
  // A detailed single-atom scene (`shells`/`showNucleus` params) opens with shells on.
  modes: (scene) => {
    const p = (scene.params ?? {}) as { shells?: unknown; showNucleus?: unknown };
    const shellsOn = Array.isArray(p.shells) || p.showNucleus === true;
    return MOLECULE_MODES.map((m) => (m.id === 'shells' ? { ...m, default: shellsOn } : { ...m }));
  },
  Component: MoleculeScene,
};
