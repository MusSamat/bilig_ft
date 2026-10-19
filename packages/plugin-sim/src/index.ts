/**
 * @bilig/plugin-sim — physics/astronomy simulations (pendulum, inclined plane,
 * DC circuit, orbits, moon phases, seasons) with formula readouts (TZ W-25, W-43).
 */
import type { ScenePlugin } from '@bilig/scene-core';
import { SimScene } from './SimScene.js';
import { simReadouts } from './readouts.js';
import { ALL_SIM_MODES, modelFor } from './models.js';

export * from './physics.js';
export * from './readouts.js';
export { MODELS, SIM_MODELS, ALL_SIM_MODES, BODIES, modelFor, circuitLoop, orbitRadius, type SimModel, type SimModelId } from './models.js';
export { SimScene } from './SimScene.js';
export * from './models/kinematics.js';
export * from './models/forces.js';
export * from './models/lever.js';
export * from './models/particles.js';
export * from './models/separation.js';
export * from './models/reactionVessel.js';
export * from './models/energyProfile.js';
export * from './models/foodWeb.js';
export * from './models/nutritionPlate.js';

/** Every sim mode id (per model, `modes()` returns the model's subset). */
export const SIM_MODES = ALL_SIM_MODES;

export const simPlugin: ScenePlugin = {
  type: 'sim',
  modes: (scene) => {
    const m = (scene.params as { model?: unknown } | undefined)?.model;
    if (typeof m !== 'string') return [...ALL_SIM_MODES];
    const model = modelFor(scene.params);
    return [...(model.modesFor?.((scene.params ?? {}) as Record<string, unknown>) ?? model.modes)];
  },
  Component: SimScene,
  readouts: simReadouts,
};
