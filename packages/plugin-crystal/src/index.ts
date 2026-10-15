/** @bilig/plugin-crystal — crystal lattices (sc, bcc, fcc, rock-salt, CsCl-type) with unit cell (TZ W-25). */
import type { ModeDef, ScenePlugin } from '@bilig/scene-core';
import { CrystalScene } from './CrystalScene.js';

export * from './lattice.js';
export * from './build.js';
export { CrystalScene } from './CrystalScene.js';

export const CRYSTAL_MODES: readonly ModeDef[] = [
  { id: 'ball-stick', group: 'rep', default: true, label: { ky: 'Шар-таякча', ru: 'Шаростержневая', en: 'Ball-and-stick' } },
  { id: 'spacefill', group: 'rep', label: { ky: 'Көлөмдүү', ru: 'Объёмная', en: 'Space-filling' } },
];

export const crystalPlugin: ScenePlugin = {
  type: 'crystal',
  modes: () => [...CRYSTAL_MODES],
  Component: CrystalScene,
};
