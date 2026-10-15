/**
 * Geometry generator params (TZ W-23 «Тело / Каркас», content convention):
 * `solids[{id, type, …dimensions, position}]` with types `cube` (edge),
 * `box` (size), `pyramid` (baseEdge, height), `sphere` (radius),
 * `cylinder` / `cone` (radius, height), `right-triangle` (legs [a, b],
 * squaresOnSides), `tetrahedron` / `octahedron` / `prism` (edge, height).
 * Legacy `{shape, size, pos, rotation°, concept…}` is still accepted.
 */
import type { Vec3 } from '@bilig/content-model';

export const SHAPES = [
  'cube', 'box', 'sphere', 'cylinder', 'cone', 'tetrahedron', 'octahedron',
  'dodecahedron', 'icosahedron', 'pyramid', 'prism', 'torus', 'right-triangle',
] as const;
export type Shape = (typeof SHAPES)[number];

export interface Solid {
  id: string;
  type: Shape;
  position: Vec3;
  /** Euler rotation, radians. */
  rotation: Vec3;
  /** Edge length (cube, tetrahedron, octahedron, prism). */
  edge: number;
  /** Box extents. */
  size: Vec3;
  baseEdge: number;
  height: number;
  radius: number;
  legs: [number, number];
  squaresOnSides: boolean;
  /** Explicit concept keys (legacy params). */
  concept?: string;
  edgesConcept?: string;
  verticesConcept?: string;
}

const DEG = Math.PI / 180;
const pos = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
const vec = (v: unknown): Vec3 | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as Vec3) : undefined;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Parse `{ solids: [...] }`; unknown types and malformed entries are dropped. */
export function parseGeometryParams(raw: unknown): Solid[] {
  const solids = raw && typeof raw === 'object' && Array.isArray((raw as { solids?: unknown }).solids) ? ((raw as { solids: unknown[] }).solids) : [];
  const used = new Set<string>();
  return solids.flatMap((s, i) => {
    if (!s || typeof s !== 'object') return [];
    const o = s as Record<string, unknown>;
    const type = (str(o.type) ?? str(o.shape)) as Shape | undefined;
    if (!type || !(SHAPES as readonly string[]).includes(type)) return [];
    let id = (str(o.id) ?? type).replace(/[^A-Za-z0-9-]+/g, '-');
    if (used.has(id)) id = `${id}${i + 1}`;
    used.add(id);
    const sizeN = pos(o.size);
    const sizeV = vec(o.size);
    const size: Vec3 = sizeV ?? (sizeN ? [sizeN, sizeN, sizeN] : [1.6, 1.6, 1.6]);
    const legs = Array.isArray(o.legs) && o.legs.length === 2 && o.legs.every((x) => pos(x)) ? (o.legs as [number, number]) : ([3, 4] as [number, number]);
    const rot = vec(o.rotation);
    return [{
      id,
      type,
      position: vec(o.position) ?? vec(o.pos) ?? [0, 0, 0],
      rotation: rot ? (rot.map((v) => v * DEG) as Vec3) : [0, 0, 0],
      edge: pos(o.edge) ?? sizeN ?? size[0],
      size,
      baseEdge: pos(o.baseEdge) ?? pos(o.edge) ?? sizeN ?? 1.6,
      height: pos(o.height) ?? sizeN ?? size[1],
      radius: pos(o.radius) ?? (sizeN ? sizeN / 2 : 0.8),
      legs,
      squaresOnSides: o.squaresOnSides === true,
      concept: str(o.concept),
      edgesConcept: str(o.edgesConcept),
      verticesConcept: str(o.verticesConcept),
    }];
  });
}

export interface SolidStats {
  faces: number;
  edges: number;
  vertices: number;
}

const STATS: Partial<Record<Shape, SolidStats>> = {
  cube: { faces: 6, edges: 12, vertices: 8 },
  box: { faces: 6, edges: 12, vertices: 8 },
  tetrahedron: { faces: 4, edges: 6, vertices: 4 },
  octahedron: { faces: 8, edges: 12, vertices: 6 },
  dodecahedron: { faces: 12, edges: 30, vertices: 20 },
  icosahedron: { faces: 20, edges: 30, vertices: 12 },
  /** Square pyramid. */
  pyramid: { faces: 5, edges: 8, vertices: 5 },
  /** Triangular prism. */
  prism: { faces: 5, edges: 9, vertices: 6 },
};

/** Faces/edges/vertices of a polyhedron; null for curved or flat shapes. Euler: V − E + F = 2. */
export function solidStats(shape: Shape): SolidStats | null {
  return STATS[shape] ?? null;
}

export const isPolyhedron = (shape: Shape) => solidStats(shape) !== null;
