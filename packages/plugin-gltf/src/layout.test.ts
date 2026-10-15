import { describe, it, expect } from 'vitest';
import { bindParts, unboundConcepts } from '@bilig/scene-kit';
import { realTopics } from '../../scene-kit/src/real-packages.test-util.js';
import { GLOB_INSTANCES, OUTER_SHELL_RADIUS, nodeNamesFor, proceduralParts } from './layout.js';
import { gltfPlugin } from './index.js';

const c = (key: string, isContainer = false, nodes?: string[], anchor?: [number, number, number]) => ({ key, isContainer, nodes, anchor, hue: 100 });

describe('proceduralParts', () => {
  it('names objects after node masks, with instances for globs', () => {
    expect(nodeNamesFor(c('a', false, ['Mito_*']))).toEqual(['Mito_1', 'Mito_2', 'Mito_3']);
    expect(nodeNamesFor(c('a', false, ['Nucleus', 'Nucleolus']))).toEqual(['Nucleus']);
    expect(nodeNamesFor(c('x.y-z'))).toEqual(['Concept_x_y_z']);
    const parts = proceduralParts([c('m', true, ['Membrane']), c('n', false, ['Nucleus'], [0, 0.2, 0]), c('mi', false, ['Mito_*'])]);
    expect(parts.map((p) => p.name)).toEqual(['Membrane', 'Nucleus', 'Mito_1', 'Mito_2', 'Mito_3']);
    expect(parts.filter((p) => p.name.startsWith('Mito_'))).toHaveLength(GLOB_INSTANCES);
  });
  it('nests shells, stays inside them and is deterministic', () => {
    const list = [c('outer', true), c('inner', true), c('a', false, undefined, [0, 0.2, 0]), c('b'), c('d', false, ['D_*'])];
    const one = proceduralParts(list);
    expect(proceduralParts(list)).toEqual(one);
    const shells = one.filter((p) => p.container);
    expect(shells.map((s) => (s.shape.kind === 'sphere' ? s.shape.radius : 0))).toEqual([OUTER_SHELL_RADIUS, OUTER_SHELL_RADIUS - 0.32]);
    for (const p of one) expect(Math.hypot(...p.position!)).toBeLessThan(OUTER_SHELL_RADIUS);
    expect(one.find((p) => p.name === 'Concept_a')!.position).toEqual([0, 0.2, 0]);
  });
  it('binds through conceptForNode', () => {
    const concepts = [c('k.m', true, ['Mito_*'])].map((x) => ({ ...x, kind: 'k', title: { ky: 'k', ru: 'k', en: 'k' }, description: { ky: 'k', ru: 'k', en: 'k' }, props: [], related: [], misconceptions: [], examples: { stem: [], simple: [] } }));
    expect(bindParts(proceduralParts(concepts), concepts).get('Mito_1')).toBe('k.m');
  });
});

describe('gltf plugin', () => {
  it('offers whole/section in the view group, whole by default', () => {
    expect(gltfPlugin.modes({ plugin: 'gltf', asset: 'a.glb', modes: [] }).map((m) => [m.id, m.group, !!m.default])).toEqual([
      ['whole', 'view', true],
      ['section', 'view', false],
    ]);
  });
  const topics = realTopics('gltf');
  it.skipIf(!topics.length)('every gltf topic: procedural scene binds every node-bound concept', () => {
    for (const { file, concepts } of topics) expect(unboundConcepts(proceduralParts(concepts), concepts), file).toEqual([]);
  });
});
