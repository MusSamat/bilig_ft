/**
 * Geometry scene as named parts (content convention): `<id>` (solid group),
 * `<id>_Face_*`, `<id>_Edge_*`, `<id>_Vertex_*`, plus measurement guides
 * `<id>_Height` and `<id>_Radius`. Faces are containers (translucent, never
 * steal clicks from edges and vertices).
 */
import type { Vec3 } from '@bilig/content-model';
import type { ModeState } from '@bilig/scene-core';
import { add, len3, sub, type Part } from '@bilig/scene-kit';

/** Edge colour: near-black slate, crisp on light faces and on a projector. */
const EDGE = '#1d2733';
import type { Solid } from './solids.js';

export type Render = 'solid' | 'wireframe';
/** Render mode from the `view` group (legacy `render`). */
export function renderFrom(modes: ModeState): Render {
  return (modes.view ?? modes.render) === 'wireframe' ? 'wireframe' : 'solid';
}

interface Poly {
  verts: Vec3[];
  faces: number[][];
  vertexNames?: string[];
  edgeNames?: Record<string, string>;
}

function polyFor(s: Solid): Poly | null {
  const h = (x: number) => x / 2;
  switch (s.type) {
    case 'cube':
    case 'box': {
      const [x, y, z] = s.type === 'cube' ? [s.edge, s.edge, s.edge] : s.size;
      const v: Vec3[] = [];
      for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) v.push([(i * x) / 2, (j * y) / 2, (k * z) / 2]);
      return { verts: v, faces: [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]] };
    }
    case 'pyramid': {
      // Square base on the solid's position plane, apex `height` above it.
      const b = h(s.baseEdge);
      return { verts: [[-b, 0, -b], [b, 0, -b], [b, 0, b], [-b, 0, b], [0, s.height, 0]], faces: [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]], vertexNames: ['1', '2', '3', '4', 'Apex'] };
    }
    case 'tetrahedron': {
      const e = s.edge / Math.SQRT2 / 2;
      return { verts: [[e, e, e], [-e, -e, e], [-e, e, -e], [e, -e, -e]], faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] };
    }
    case 'octahedron': {
      const e = s.edge / Math.SQRT2;
      return { verts: [[e, 0, 0], [-e, 0, 0], [0, e, 0], [0, -e, 0], [0, 0, e], [0, 0, -e]], faces: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]] };
    }
    case 'prism': {
      const r = s.edge / Math.sqrt(3);
      const tri = [0, 1, 2].map((k) => [Math.cos((2 * Math.PI * k) / 3 + Math.PI / 2) * r, Math.sin((2 * Math.PI * k) / 3 + Math.PI / 2) * r]);
      const v: Vec3[] = [...tri.map(([x, z]): Vec3 => [x, -h(s.height), z]), ...tri.map(([x, z]): Vec3 => [x, h(s.height), z])];
      return { verts: v, faces: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]] };
    }
    case 'right-triangle': {
      const [a, b] = s.legs;
      // C (right angle) at the origin, A on +x, B on +y.
      return { verts: [[0, 0, 0], [a, 0, 0], [0, b, 0]], faces: [[0, 1, 2]], vertexNames: ['C', 'A', 'B'], edgeNames: { '0-1': 'a', '0-2': 'b', '1-2': 'c' } };
    }
    default:
      return null;
  }
}

function circle(r: number, y: number, n = 48): Vec3[] {
  return Array.from({ length: n }, (_, i) => [Math.cos((2 * Math.PI * i) / n) * r, y, Math.sin((2 * Math.PI * i) / n) * r] as Vec3);
}

function solidParts(s: Solid): Part[] {
  const id = s.id;
  const scale = Math.max(s.edge, s.baseEdge, s.height, s.radius * 2, ...s.legs, ...s.size) || 1;
  const er = Math.max(0.015, scale * 0.012);
  const vr = er * 2.6;
  const parts: Part[] = [{ name: id, shape: { kind: 'group' }, position: s.position, rotation: s.rotation, concept: s.concept, container: true }];
  const face = (name: string, points: Vec3[]): Part => ({ name: `${id}_Face_${name}`, parent: id, shape: { kind: 'polygon', points }, container: true, concept: s.concept });
  const edgeP = (name: string, a: Vec3, b: Vec3): Part => ({ name: `${id}_Edge_${name}`, parent: id, shape: { kind: 'tube', from: a, to: b, radius: er }, color: EDGE, material: 'plastic', concept: s.edgesConcept });
  const vertexP = (name: string, p: Vec3): Part => ({ name: `${id}_Vertex_${name}`, parent: id, shape: { kind: 'sphere', radius: vr, widthSegments: 24 }, position: p, color: '#ef476f', material: 'plastic', concept: s.verticesConcept });
  // Measurement guides: slightly self-lit so they read through the glass faces, with end dots.
  const guide = (name: string, a: Vec3, b: Vec3, color: string): Part[] => [
    { name: `${id}_${name}`, parent: id, shape: { kind: 'tube', from: a, to: b, radius: er * 0.9 }, color, material: 'plastic', glow: 0.35 },
    { name: `${id}_${name}_End`, parent: `${id}_${name}`, shape: { kind: 'sphere', radius: er * 1.9, widthSegments: 16 }, position: [0, len3(sub(b, a)) / 2, 0], color, material: 'plastic', glow: 0.35 },
  ];
  // Thin surface lines (meridians, generators) that show the form of curved solids; they carry no concept of their own.
  const line = (name: string, shape: Part['shape'], extra: Partial<Part> = {}): Part => ({ name: `${id}_Grid_${name}`, parent: id, shape, color: EDGE, opacity: 0.5, container: true, noPick: true, ...extra });

  const poly = polyFor(s);
  if (poly) {
    poly.faces.forEach((f, i) => parts.push(face(s.type === 'right-triangle' ? 'Main' : String(i + 1), f.map((k) => poly.verts[k]))));
    const seen = new Set<string>();
    let e = 0;
    for (const f of poly.faces) {
      f.forEach((k, i) => {
        const a = Math.min(k, f[(i + 1) % f.length]);
        const b = Math.max(k, f[(i + 1) % f.length]);
        const key = `${a}-${b}`;
        if (seen.has(key)) return;
        seen.add(key);
        parts.push(edgeP(poly.edgeNames?.[key] ?? String(++e), poly.verts[a], poly.verts[b]));
      });
    }
    poly.verts.forEach((v, i) => parts.push(vertexP(poly.vertexNames?.[i] ?? String(i + 1), v)));
    if (s.type === 'pyramid') parts.push(...guide('Height', [0, s.height, 0], [0, 0, 0], '#ffd166'));
    if (s.type === 'right-triangle') {
      // Right-angle mark at C (part of the right-angle concept through its parent vertex).
      const m = Math.min(...s.legs) * 0.14;
      parts.push({ name: `${id}_Vertex_C_Mark_1`, parent: `${id}_Vertex_C`, shape: { kind: 'tube', from: [m, 0, 0.002], to: [m, m, 0.002], radius: er * 0.7 }, color: EDGE, material: 'plastic' });
      parts.push({ name: `${id}_Vertex_C_Mark_2`, parent: `${id}_Vertex_C`, shape: { kind: 'tube', from: [0, m, 0.002], to: [m, m, 0.002], radius: er * 0.7 }, color: EDGE, material: 'plastic' });
    }
    if (s.type === 'right-triangle' && s.squaresOnSides) {
      const [a, b] = s.legs;
      const A: Vec3 = [a, 0, 0];
      const B: Vec3 = [0, b, 0];
      const n: Vec3 = [b, a, 0]; // outward normal of AB scaled to |AB|
      // Squares carry a unit grid (one cell per unit²: 9 + 16 = 25) and their own outlines.
      const square = (name: string, pts: Vec3[]) => {
        parts.push({ ...face(name, pts), texture: 'grid', textureScale: 1 });
        pts.forEach((p, i) => parts.push({ name: `${id}_Face_${name}_Edge_${i + 1}`, parent: id, shape: { kind: 'tube', from: p, to: pts[(i + 1) % pts.length], radius: er * 0.8 }, color: EDGE, material: 'plastic', concept: s.concept }));
      };
      square('Square_a', [[0, 0, 0], A, [a, -a, 0], [0, -a, 0]]);
      square('Square_b', [[0, 0, 0], B, [-b, b, 0], [-b, 0, 0]]);
      square('Square_c', [A, add(A, n), add(B, n), B]);
    }
    return parts;
  }
  switch (s.type) {
    case 'sphere':
      parts.push({ name: `${id}_Face_Surface`, parent: id, shape: { kind: 'sphere', radius: s.radius, widthSegments: 48 }, container: true, concept: s.concept });
      parts.push({ name: `${id}_Edge_Equator`, parent: id, shape: { kind: 'torus', radius: s.radius, tube: er, segments: 128 }, rotation: [Math.PI / 2, 0, 0], color: EDGE, material: 'plastic', concept: s.edgesConcept });
      for (let k = 0; k < 6; k++) parts.push(line(`M${k + 1}`, { kind: 'torus', radius: s.radius * 1.001, tube: er * 0.4, segments: 96 }, { rotation: [0, (k * Math.PI) / 6, 0] }));
      for (const [k, lat] of [[1, Math.PI / 4], [2, -Math.PI / 4]] as const) {
        parts.push(line(`P${k}`, { kind: 'torus', radius: s.radius * Math.cos(lat) * 1.001, tube: er * 0.4, segments: 96 }, { position: [0, s.radius * Math.sin(lat), 0], rotation: [Math.PI / 2, 0, 0] }));
      }
      parts.push(vertexP('Center', [0, 0, 0]));
      parts.push(...guide('Radius', [0, 0, 0], [s.radius, 0, 0], '#06d6a0'));
      break;
    case 'cylinder': {
      const y = s.height / 2;
      parts.push({ name: `${id}_Face_Side`, parent: id, shape: { kind: 'cylinder', radiusTop: s.radius, radiusBottom: s.radius, height: s.height, segments: 48, openEnded: true }, container: true, concept: s.concept });
      parts.push(face('BaseTop', circle(s.radius, y)), face('BaseBottom', circle(s.radius, -y)));
      parts.push({ name: `${id}_Edge_Top`, parent: id, shape: { kind: 'torus', radius: s.radius, tube: er, segments: 128 }, position: [0, y, 0], rotation: [Math.PI / 2, 0, 0], color: EDGE, material: 'plastic', concept: s.edgesConcept });
      parts.push({ name: `${id}_Edge_Bottom`, parent: id, shape: { kind: 'torus', radius: s.radius, tube: er, segments: 128 }, position: [0, -y, 0], rotation: [Math.PI / 2, 0, 0], color: EDGE, material: 'plastic', concept: s.edgesConcept });
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        const p: Vec3 = [Math.cos(a) * s.radius * 1.002, 0, Math.sin(a) * s.radius * 1.002];
        parts.push(line(`G${k + 1}`, { kind: 'tube', from: [p[0], -y, p[2]], to: [p[0], y, p[2]], radius: er * 0.4 }));
      }
      parts.push(...guide('Height', [0, -y, 0], [0, y, 0], '#ffd166'), ...guide('Radius', [0, -y, 0], [s.radius, -y, 0], '#06d6a0'));
      break;
    }
    case 'cone': {
      const y = s.height / 2;
      parts.push({ name: `${id}_Face_Side`, parent: id, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: s.radius, height: s.height, segments: 48, openEnded: true }, container: true, concept: s.concept });
      parts.push(face('Base', circle(s.radius, -y)));
      parts.push({ name: `${id}_Edge_Base`, parent: id, shape: { kind: 'torus', radius: s.radius, tube: er, segments: 128 }, position: [0, -y, 0], rotation: [Math.PI / 2, 0, 0], color: EDGE, material: 'plastic', concept: s.edgesConcept });
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        parts.push(line(`G${k + 1}`, { kind: 'tube', from: [Math.cos(a) * s.radius * 1.002, -y, Math.sin(a) * s.radius * 1.002], to: [0, y, 0], radius: er * 0.4 }));
      }
      parts.push(vertexP('Apex', [0, y, 0]));
      parts.push(...guide('Height', [0, -y, 0], [0, y, 0], '#ffd166'), ...guide('Radius', [0, -y, 0], [s.radius, -y, 0], '#06d6a0'));
      break;
    }
    case 'torus':
      parts.push({ name: `${id}_Face_Surface`, parent: id, shape: { kind: 'torus', radius: s.radius, tube: s.radius * 0.35 }, container: true, concept: s.concept });
      break;
    case 'dodecahedron':
    case 'icosahedron':
      parts.push({ name: `${id}_Face_1`, parent: id, shape: { kind: 'icosahedron', radius: s.edge * (s.type === 'dodecahedron' ? 1.4 : 0.95), detail: 0 }, container: true, concept: s.concept });
      break;
  }
  return parts;
}

export function buildGeometryParts(solids: readonly Solid[]): Part[] {
  return solids.flatMap((s) => solidParts(s));
}

/** Opacity of faces for a render mode. */
export const faceOpacity = (r: Render) => (r === 'wireframe' ? 0.06 : 0.62);

