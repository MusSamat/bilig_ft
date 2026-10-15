import { describe, it, expect } from 'vitest';
import {
  PluginRegistry,
  UNIVERSAL_MODES,
  type ScenePlugin,
  type ModeDef,
  type SceneProps,
} from './index.js';
import type { SceneSpec } from '@bilig/content-model';

const L = (s: string) => ({ ky: s, ru: s, en: s });

// A no-op component — the registry never renders in these pure tests.
const NullComponent = (_props: SceneProps) => null;

const bioPlugin: ScenePlugin = {
  type: 'glb',
  Component: NullComponent,
  modesFor: (scene: SceneSpec): ModeDef[] =>
    scene.modes.includes('section')
      ? [{ id: 'section', label: L('Разрез'), group: 'view' }]
      : [],
};

const chemPlugin: ScenePlugin = {
  type: 'molecule',
  Component: NullComponent,
  modesFor: (): ModeDef[] => [
    { id: 'ballstick', label: L('Шаростержневая'), group: 'rep', default: true },
    { id: 'spacefill', label: L('Объёмная'), group: 'rep' },
  ],
};

describe('PluginRegistry (TZ W-23: panel from plugin.modesFor + universal, no if(subject))', () => {
  it('registers and dispatches on plugin type', () => {
    const r = new PluginRegistry();
    r.register(bioPlugin);
    expect(r.has('glb')).toBe(true);
    expect(r.has('molecule')).toBe(false);
    expect(r.get('glb')).toBe(bioPlugin);
  });

  it('modesFor appends the always-present universal modes', () => {
    const r = new PluginRegistry();
    r.register(bioPlugin);
    const scene: SceneSpec = { plugin: 'glb', modes: ['section'] };
    const ids = r.modesFor(scene).map((m) => m.id);
    expect(ids).toContain('section');
    for (const u of UNIVERSAL_MODES) expect(ids).toContain(u.id);
  });

  it('derives the panel purely from scene data (same core, different subjects)', () => {
    const r = new PluginRegistry();
    r.register(bioPlugin);
    r.register(chemPlugin);
    const bio = r.modesFor({ plugin: 'glb', modes: ['section'] }).map((m) => m.id);
    const chem = r
      .modesFor({ plugin: 'molecule', modes: [] })
      .map((m) => m.id);
    expect(bio).toContain('section');
    expect(chem).toEqual(expect.arrayContaining(['ballstick', 'spacefill']));
  });

  it('returns only universal modes for an unregistered plugin type', () => {
    const r = new PluginRegistry();
    const ids = r.modesFor({ plugin: 'sim', modes: [] }).map((m) => m.id);
    expect(ids).toEqual(UNIVERSAL_MODES.map((m) => m.id));
  });
});
