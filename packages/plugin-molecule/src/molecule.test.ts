import { describe, it, expect } from 'vitest';
import { defaultModeState, resolveModes } from '@bilig/scene-core';
import { bindParts, unboundConcepts } from '@bilig/scene-kit';
import { realTopics } from '../../scene-kit/src/real-packages.test-util.js';
import { element, shellConfig, ELEMENTS } from './elements.js';
import { atomRadius, inferBonds, parseMoleculeParams } from './params.js';
import { buildMoleculeParts, repFrom } from './build.js';
import { moleculePlugin } from './index.js';

const water = {
  formula: 'H2O',
  atoms: [
    { id: 'O1', element: 'O', position: [0, 0, 0] },
    { id: 'H1', element: 'H', position: [0.757, -0.586, 0] },
    { id: 'H2', element: 'H', position: [-0.757, -0.586, 0] },
  ],
  bonds: [{ a: 'O1', b: 'H1', order: 1 }, { a: 'O1', b: 'H2', order: 1 }],
  lonePairs: [{ atom: 'O1', count: 2 }],
};

describe('elements', () => {
  it('covers H–Kr; Bohr filling 2, 8, 8, 18', () => {
    expect(Object.keys(ELEMENTS)).toHaveLength(36);
    expect(element('kr').z).toBe(36);
    expect(shellConfig(11)).toEqual([2, 8, 1]);
    expect(shellConfig(19)).toEqual([2, 8, 8, 1]);
    expect(shellConfig(0)).toEqual([]);
  });
});

describe('params', () => {
  it('parses the content shape with atom ids', () => {
    const p = parseMoleculeParams(water);
    expect(p.formula).toBe('H2O');
    expect(p.molecules[0].atoms.map((a) => a.id)).toEqual(['O1', 'H1', 'H2']);
    expect(p.molecules[0].bonds).toEqual([{ a: 'O1', b: 'H1', order: 1, concept: undefined }, { a: 'O1', b: 'H2', order: 1, concept: undefined }]);
    expect(p.molecules[0].lonePairs).toEqual([{ atom: 'O1', count: 2 }]);
  });
  it('accepts the legacy {el, pos} shape with index bonds and infers missing bonds', () => {
    const legacy = parseMoleculeParams({ atoms: [{ el: 'O', pos: [0, 0, 0] }, { el: 'H', pos: [0.96, 0, 0] }, 'junk'], bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 9 }] });
    expect(legacy.molecules[0].bonds).toEqual([{ a: 'O1', b: 'H2', order: 2, concept: undefined }]);
    expect(inferBonds(parseMoleculeParams(water).molecules[0].atoms)).toHaveLength(2);
    expect(parseMoleculeParams(undefined).molecules).toEqual([]);
  });
  it('space filling uses larger radii; rep from modes', () => {
    expect(atomRadius('O', 'spacefill')).toBeGreaterThan(atomRadius('O', 'ball-stick'));
    expect(repFrom({ rep: 'spacefill' })).toBe('spacefill');
    expect(repFrom({ repr: 'spaceFill' })).toBe('spacefill');
    expect(repFrom({})).toBe('ball-stick');
  });
});

describe('node names', () => {
  it('names atoms, bonds, lone pairs and shells per convention', () => {
    const p = parseMoleculeParams(water);
    const names = buildMoleculeParts(p, { modes: { rep: 'ball-stick' } }).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['Molecule_H2O', 'Atom_O1', 'Atom_H1', 'Bond_O1_H1', 'LonePair_O1_1', 'LonePair_O1_2']));
    const shells = buildMoleculeParts(p, { modes: { shells: true } }).map((x) => x.name);
    expect(shells).toEqual(expect.arrayContaining(['Nucleus_O1', 'Shell_O1_1', 'Shell_O1_2', 'Electron_O1_8']));
    expect(new Set(shells).size).toBe(shells.length);
  });
  it('detailed atom: protons, neutrons, numbered electrons', () => {
    const p = parseMoleculeParams({ formula: 'Na', atoms: [{ id: 'Na1', element: 'Na', position: [0, 0, 0] }], shells: [2, 8, 1], protons: 11, neutrons: 12, showNucleus: true });
    const parts = buildMoleculeParts(p, { modes: { shells: true } });
    expect(parts.filter((x) => x.name.startsWith('Proton_Na1_'))).toHaveLength(11);
    expect(parts.filter((x) => x.name.startsWith('Neutron_Na1_'))).toHaveLength(12);
    const valence = parts.find((x) => x.name === 'Electron_Na1_11')!;
    expect(valence.position![0]).toBeCloseTo(3.6, 9);
    expect(moleculePlugin.modes({ plugin: 'molecule', params: p.raw, modes: [] }).find((m) => m.id === 'shells')?.default).toBe(true);
  });
  it('bonds bind through the parent group for multi-bonds', () => {
    const parts = buildMoleculeParts(parseMoleculeParams({ formula: 'O2', atoms: [{ id: 'O1', element: 'O', position: [0, 0, 0] }, { id: 'O2', element: 'O', position: [1.21, 0, 0] }], bonds: [{ a: 'O1', b: 'O2', order: 2 }] }), { modes: {} });
    const b = bindParts(parts, [{ key: 'k.bond', kind: 'bond', hue: 1, isContainer: false, title: { ky: 'b', ru: 'b', en: 'b' }, description: { ky: 'b', ru: 'b', en: 'b' }, props: [], related: [], misconceptions: [], examples: { stem: [], simple: [] }, nodes: ['Bond_*'] }]);
    expect(b.get('Bond_O1_O2_2')).toBe('k.bond');
  });
});

describe('real content packages', () => {
  const topics = realTopics('molecule');
  it.skipIf(!topics.length)('every molecule topic parses and binds every node-bound concept', () => {
    for (const { file, pkg, concepts } of topics) {
      const scene = pkg.topic.scene;
      const defs = resolveModes(moleculePlugin.modes(scene), scene.modes);
      for (const m of scene.modes) expect(defs.map((d) => d.id), `${file} ${m}`).toContain(m);
      const p = parseMoleculeParams(scene.params);
      const defaults = defaultModeState(defs);
      // A concept counts as bound when some representation the topic offers shows it.
      const states = [defaults, ...defs.filter((d) => !d.group).map((d) => ({ ...defaults, [d.id]: !defaults[d.id] })), ...defs.filter((d) => d.group).map((d) => ({ ...defaults, [d.group!]: d.id }))];
      const unbound = new Set(concepts.filter((c) => c.nodes?.length).map((c) => c.key));
      for (const st of states) {
        const parts = buildMoleculeParts(p, { modes: st, concepts });
        expect(parts.length, file).toBeGreaterThan(0);
        const missing = new Set(unboundConcepts(parts, concepts));
        for (const k of [...unbound]) if (!missing.has(k)) unbound.delete(k);
      }
      expect([...unbound], file).toEqual([]);
    }
  });
});
