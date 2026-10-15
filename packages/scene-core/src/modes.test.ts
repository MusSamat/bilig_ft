import { describe, it, expect } from 'vitest';
import {
  PluginRegistry,
  UNIVERSAL_MODES,
  applyModes,
  decodeModes,
  defaultModeState,
  encodeModes,
  isModeActive,
  modeGroups,
  resolveModes,
  toggleMode,
  type ModeDef,
  type ScenePlugin,
  type SceneProps,
} from './index.js';
import { L, type SceneSpec } from '@bilig/content-model';

const NullComponent = (_props: SceneProps) => null;

const bio: ModeDef[] = [
  { id: 'whole', label: L('Целиком'), group: 'view', default: true },
  { id: 'section', label: L('Разрез'), group: 'view' },
];
const chem: ModeDef[] = [
  { id: 'ball-stick', label: L('Шаростержневая'), group: 'rep' },
  { id: 'spacefill', label: L('Объёмная'), group: 'rep' },
  { id: 'shells', label: L('Электронные оболочки') },
];

const gltf: ScenePlugin = { type: 'gltf', Component: NullComponent, modes: () => bio };
const molecule: ScenePlugin = { type: 'molecule', Component: NullComponent, modes: () => chem };

describe('resolveModes (W-23: plugin.modes() ∩ scene.modes + universal)', () => {
  it('filters plugin modes by the topic list, keeps plugin order, appends universal', () => {
    expect(resolveModes(chem, ['shells', 'ball-stick']).map((m) => m.id)).toEqual([
      'ball-stick', 'shells', 'labels', 'rotate',
    ]);
  });

  it('empty scene.modes → all plugin modes; duplicates keep the first definition', () => {
    expect(resolveModes(chem, []).map((m) => m.id)).toEqual(['ball-stick', 'spacefill', 'shells', 'labels', 'rotate']);
    const dup = resolveModes([{ id: 'labels', label: L('X') }], []);
    expect(dup.filter((m) => m.id === 'labels')).toHaveLength(1);
    expect(dup[0].label.ru).toBe('X');
  });
});

describe('PluginRegistry', () => {
  it('dispatches on plugin kind and derives panels from data (no if(subject))', () => {
    const r = new PluginRegistry();
    r.register(gltf);
    r.register(molecule);
    expect(r.has('gltf')).toBe(true);
    expect(r.get('molecule')).toBe(molecule);
    const bioScene: SceneSpec = { plugin: 'gltf', asset: 'm.glb', modes: ['whole', 'section'] };
    expect(r.modesFor(bioScene).map((m) => m.id)).toEqual(['whole', 'section', 'labels', 'rotate']);
    expect(r.modesFor({ plugin: 'molecule', params: {}, modes: ['spacefill'] }).map((m) => m.id)).toEqual([
      'spacefill', 'labels', 'rotate',
    ]);
  });

  it('unregistered plugin → only universal modes', () => {
    const r = new PluginRegistry();
    expect(r.has('sim')).toBe(false);
    expect(r.modesFor({ plugin: 'sim', params: {}, modes: [] }).map((m) => m.id)).toEqual(
      UNIVERSAL_MODES.map((m) => m.id),
    );
  });
});

describe('mode state: defaults and group exclusivity', () => {
  const defs = resolveModes([...bio, ...chem], []);

  it('defaults: flagged mode, else first of group; toggles from `default`', () => {
    expect(defaultModeState(defs)).toEqual({ view: 'whole', rep: 'ball-stick', shells: false, labels: false, rotate: true });
    expect(modeGroups(defs)).toEqual(['view', 'rep']);
  });

  it('selecting in a group is exclusive; toggles flip; unknown ids ignored', () => {
    let s = defaultModeState(defs);
    s = toggleMode(s, defs, 'section');
    expect(s.view).toBe('section');
    expect(isModeActive(s, defs.find((d) => d.id === 'section')!)).toBe(true);
    expect(isModeActive(s, defs.find((d) => d.id === 'whole')!)).toBe(false);
    s = toggleMode(s, defs, 'section'); // re-clicking a segment keeps it selected
    expect(s.view).toBe('section');
    s = toggleMode(s, defs, 'labels');
    expect(s.labels).toBe(true);
    expect(toggleMode(s, defs, 'nope')).toBe(s);
  });

  it('applyModes takes tour-step patches and ignores invalid entries', () => {
    const s = applyModes(defaultModeState(defs), defs, { view: 'section', labels: true, rep: 'nope', ghost: true, whole: true });
    expect(s).toMatchObject({ view: 'section', labels: true, rep: 'ball-stick' });
    expect(s).not.toHaveProperty('ghost');
    expect(s.whole).toBeUndefined();
  });

  it('URL tokens encode only differences from defaults and round-trip', () => {
    const d = defaultModeState(defs);
    expect(encodeModes(d, defs)).toEqual([]);
    const s = { ...d, view: 'section', labels: true, rotate: false };
    const tokens = encodeModes(s, defs);
    expect(tokens).toEqual(['section', 'labels', '-rotate']);
    expect(decodeModes(tokens, defs)).toEqual(s);
    expect(decodeModes(['bogus', '-section'], defs)).toEqual(d);
  });
});
