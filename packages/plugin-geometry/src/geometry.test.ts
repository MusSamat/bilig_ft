import { describe, it, expect } from 'vitest';
import { resolveModes } from '@bilig/scene-core';
import { unboundConcepts } from '@bilig/scene-kit';
import { realTopics } from '../../scene-kit/src/real-packages.test-util.js';
import { SHAPES, parseGeometryParams, solidStats } from './solids.js';
import { buildGeometryParts, renderFrom } from './build.js';
import { geometryPlugin } from './index.js';

describe('solidStats', () => {
  it('Euler V − E + F = 2 for every polyhedron', () => {
    expect(solidStats('cube')).toEqual({ faces: 6, edges: 12, vertices: 8 });
    for (const s of SHAPES) {
      const st = solidStats(s);
      if (st) expect(st.vertices - st.edges + st.faces).toBe(2);
    }
  });
  it('built polyhedra match their stats', () => {
    for (const type of ['cube', 'pyramid', 'tetrahedron', 'octahedron', 'prism'] as const) {
      const parts = buildGeometryParts(parseGeometryParams({ solids: [{ id: 's', type, edge: 2, baseEdge: 2, height: 2 }] }));
      const count = (k: string) => parts.filter((p) => p.name.startsWith(`s_${k}_`)).length;
      expect({ faces: count('Face'), edges: count('Edge'), vertices: count('Vertex') }, type).toEqual(solidStats(type));
    }
  });
});

describe('params and names', () => {
  it('parses the content shape and the legacy shape', () => {
    const [c, p] = parseGeometryParams({ solids: [{ id: 'cube', type: 'cube', edge: 2, position: [-2, 0, 0] }, { id: 'pyr', type: 'pyramid', baseEdge: 2, height: 3 }, { type: 'blob' }] });
    expect(c).toMatchObject({ id: 'cube', type: 'cube', edge: 2, position: [-2, 0, 0] });
    expect(p).toMatchObject({ baseEdge: 2, height: 3 });
    const [legacy] = parseGeometryParams({ solids: [{ shape: 'box', size: [1, 2, 3], rotation: [90, 0, 0], pos: [1, 1, 1] }] });
    expect(legacy).toMatchObject({ id: 'box', size: [1, 2, 3], position: [1, 1, 1] });
    expect(legacy.rotation[0]).toBeCloseTo(Math.PI / 2);
    expect(parseGeometryParams(null)).toEqual([]);
  });
  it('right triangle names legs, hypotenuse, right angle and squares', () => {
    const names = buildGeometryParts(parseGeometryParams({ solids: [{ id: 'tri', type: 'right-triangle', legs: [3, 4], squaresOnSides: true }] })).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['tri', 'tri_Face_Main', 'tri_Edge_a', 'tri_Edge_b', 'tri_Edge_c', 'tri_Vertex_C', 'tri_Face_Square_c']));
  });
  it('curved solids have guides', () => {
    const names = buildGeometryParts(parseGeometryParams({ solids: [{ id: 'cyl', type: 'cylinder', radius: 3, height: 6 }] })).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['cyl_Face_Side', 'cyl_Face_BaseTop', 'cyl_Face_BaseBottom', 'cyl_Height', 'cyl_Radius']));
  });
  it('modes: view group solid/wireframe', () => {
    expect(geometryPlugin.modes({ plugin: 'geometry', params: {}, modes: [] }).map((m) => [m.id, m.group])).toEqual([['solid', 'view'], ['wireframe', 'view']]);
    expect(renderFrom({ view: 'wireframe' })).toBe('wireframe');
    expect(renderFrom({ render: 'wireframe' })).toBe('wireframe');
  });
});

describe('real content packages', () => {
  const topics = realTopics('geometry');
  it.skipIf(!topics.length)('every geometry topic parses and binds every node-bound concept', () => {
    for (const { file, pkg, concepts } of topics) {
      const scene = pkg.topic.scene;
      const defs = resolveModes(geometryPlugin.modes(scene), scene.modes);
      for (const m of scene.modes) expect(defs.map((d) => d.id), `${file} ${m}`).toContain(m);
      for (const st of pkg.topic.activities.tour?.steps ?? []) for (const [g, v] of Object.entries(st.modes ?? {})) {
        if (typeof v === 'string') expect(defs.some((d) => d.group === g && d.id === v), `${file} tour ${g}=${v}`).toBe(true);
      }
      const parts = buildGeometryParts(parseGeometryParams(scene.params));
      expect(unboundConcepts(parts, concepts), file).toEqual([]);
    }
  });
});
