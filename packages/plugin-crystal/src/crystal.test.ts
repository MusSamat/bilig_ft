import { describe, it, expect } from 'vitest';
import { defaultModeState, resolveModes } from '@bilig/scene-core';
import { unboundConcepts } from '@bilig/scene-kit';
import { realTopics } from '../../scene-kit/src/real-packages.test-util.js';
import { latticeBonds, latticePoints, nearestNeighbour, parseCrystalParams, unitCellEdges } from './lattice.js';
import { buildCrystalParts } from './build.js';
import { crystalPlugin } from './index.js';

const P = (structure: string, cells: number | number[] = 2) =>
  parseCrystalParams({ structure, cells, latticeConstant: 1, ions: [{ element: 'Na', charge: 1 }, { element: 'Cl', charge: -1 }] });

describe('latticePoints', () => {
  it('counts points per structure', () => {
    expect(latticePoints(P('simple-cubic'))).toHaveLength(27);
    expect(latticePoints(P('bcc'))).toHaveLength(35);
    expect(latticePoints(P('fcc'))).toHaveLength(27 + 36);
    expect(latticePoints(P('rock-salt'))).toHaveLength(125);
    expect(latticePoints(P('cesium-chloride'))).toHaveLength(35);
    expect(latticePoints(P('rock-salt', [1, 1, 2]))).toHaveLength(3 * 3 * 5);
  });
  it('rock-salt puts the anion on the origin and alternates ions', () => {
    const pts = latticePoints(P('rock-salt', 1));
    expect(pts.find((p) => p.pos.every((v) => v === 0))!.ion).toBe(1);
    expect(pts.filter((p) => p.ion === 1)).toHaveLength(14);
    for (const [i, j] of latticeBonds(pts, nearestNeighbour('rocksalt', 1))) expect(pts[i].ion).not.toBe(pts[j].ion);
  });
  it('accepts the legacy shape and clamps cells', () => {
    expect(parseCrystalParams({ lattice: 'rocksalt', size: 99, a: 2, species: [{ el: 'Na' }] })).toMatchObject({ lattice: 'rocksalt', cells: [4, 4, 4], a: 2 });
    expect(parseCrystalParams(undefined).ions).toHaveLength(1);
    expect(unitCellEdges(P('sc'))).toHaveLength(12);
  });
  it('names parts per convention', () => {
    const names = buildCrystalParts(P('rock-salt', 1), {}).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Crystal', 'Ion_Na_all', 'Ion_Cl_all', 'Bond_1', 'UnitCell']));
    expect(buildCrystalParts(P('rock-salt', 1), { rep: 'spacefill' }).some((p) => p.name.startsWith('Bond_'))).toBe(false);
    expect(crystalPlugin.modes({ plugin: 'crystal', params: {}, modes: [] }).map((m) => [m.id, m.group])).toEqual([['ball-stick', 'rep'], ['spacefill', 'rep']]);
  });
});

describe('real content packages', () => {
  const topics = realTopics('crystal');
  it.skipIf(!topics.length)('every crystal topic parses and binds every node-bound concept', () => {
    for (const { file, pkg, concepts } of topics) {
      const scene = pkg.topic.scene;
      const defs = resolveModes(crystalPlugin.modes(scene), scene.modes);
      for (const m of scene.modes) expect(defs.map((d) => d.id), `${file} ${m}`).toContain(m);
      const parts = buildCrystalParts(parseCrystalParams(scene.params), defaultModeState(defs));
      expect(unboundConcepts(parts, concepts), file).toEqual([]);
    }
  });
});
