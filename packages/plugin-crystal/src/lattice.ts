/**
 * Crystal lattice generator (TZ W-25 generator `crystal`, content convention):
 * `structure` (`rock-salt`, `simple-cubic`, `bcc`, `fcc`, `cesium-chloride`),
 * `latticeConstant` (nm, scene units), `cells` ([nx, ny, nz] or n),
 * `ions[{element, charge, radius nm}]`. Legacy `{lattice, size, a, species}`
 * is still accepted. The lattice origin is a corner at (0, 0, 0); in
 * rock-salt the anion sits on the origin site. Pure and unit-tested.
 */
import { z } from 'zod';
import type { Vec3 } from '@bilig/content-model';

export const LATTICES = ['sc', 'bcc', 'fcc', 'rocksalt', 'cscl'] as const;
export type LatticeType = (typeof LATTICES)[number];

const ALIASES: Record<string, LatticeType> = {
  sc: 'sc', 'simple-cubic': 'sc', cubic: 'sc',
  bcc: 'bcc', 'body-centered-cubic': 'bcc',
  fcc: 'fcc', 'face-centered-cubic': 'fcc',
  rocksalt: 'rocksalt', 'rock-salt': 'rocksalt', halite: 'rocksalt',
  cscl: 'cscl', 'cesium-chloride': 'cscl', 'caesium-chloride': 'cscl',
};

export interface Ion {
  el: string;
  charge?: number;
  /** Ionic radius, nm (scene units). */
  radius?: number;
  concept?: string;
}
export interface CrystalParams {
  lattice: LatticeType;
  /** Unit cells per axis, each 1..4. */
  cells: [number, number, number];
  /** Lattice constant (scene units, nm in content). */
  a: number;
  ions: Ion[];
  bondConcept?: string;
}

const IonS = z.object({
  element: z.string().min(1).max(3).optional(),
  el: z.string().min(1).max(3).optional(),
  charge: z.number().finite().optional(),
  radius: z.number().positive().optional(),
  concept: z.string().min(1).optional(),
});

const clampCells = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(4, Math.max(1, Math.round(n))) : 2);

export function parseCrystalParams(input: unknown): CrystalParams {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const kind = String(raw.structure ?? raw.lattice ?? 'sc').toLowerCase();
  const cellsRaw = raw.cells ?? raw.size;
  const cells: [number, number, number] = Array.isArray(cellsRaw)
    ? [clampCells(cellsRaw[0]), clampCells(cellsRaw[1] ?? cellsRaw[0]), clampCells(cellsRaw[2] ?? cellsRaw[0])]
    : [clampCells(cellsRaw), clampCells(cellsRaw), clampCells(cellsRaw)];
  const aRaw = raw.latticeConstant ?? raw.a;
  const ions = (Array.isArray(raw.ions) ? raw.ions : Array.isArray(raw.species) ? raw.species : []).flatMap((x) => {
    const r = IonS.safeParse(x);
    const el = r.success ? r.data.element ?? r.data.el : undefined;
    return r.success && el ? [{ el, charge: r.data.charge, radius: r.data.radius, concept: r.data.concept }] : [];
  });
  return {
    lattice: ALIASES[kind] ?? 'sc',
    cells,
    a: typeof aRaw === 'number' && aRaw > 0 && Number.isFinite(aRaw) ? aRaw : 1,
    ions: ions.length ? ions : [{ el: 'C' }],
    bondConcept: typeof raw.bondConcept === 'string' ? raw.bondConcept : undefined,
  };
}

export interface LatticePoint {
  pos: Vec3;
  /** Index into params.ions. */
  ion: number;
}

/** Nearest-neighbour distance for each lattice (used for bonds). */
export function nearestNeighbour(lattice: LatticeType, a: number): number {
  switch (lattice) {
    case 'sc':
      return a;
    case 'bcc':
    case 'cscl':
      return (a * Math.sqrt(3)) / 2;
    case 'fcc':
      return a / Math.SQRT2;
    case 'rocksalt':
      return a / 2;
  }
}

/** Ion placed on the origin site: the anion (negative charge) when charges are given, else the first. */
function originIon(ions: readonly Ion[]): [number, number] {
  if (ions.length < 2) return [0, 0];
  const anion = ions.findIndex((i) => (i.charge ?? 0) < 0);
  return anion === 1 ? [1, 0] : [0, 1];
}

/**
 * Lattice points with a corner at the origin. Counts for cells n×n×n:
 * sc (n+1)³, bcc +n³, fcc +3n²(n+1), rocksalt (2n+1)³, cscl (n+1)³ + n³.
 */
export function latticePoints(p: CrystalParams): LatticePoint[] {
  const [nx, ny, nz] = p.cells;
  const { a } = p;
  const [first, second] = originIon(p.ions);
  const out: LatticePoint[] = [];
  const add = (x: number, y: number, z: number, ion: number) => out.push({ pos: [x * a, y * a, z * a], ion });
  const r = (m: number) => Array.from({ length: m }, (_, i) => i);

  if (p.lattice === 'rocksalt') {
    for (const i of r(2 * nx + 1)) for (const j of r(2 * ny + 1)) for (const k of r(2 * nz + 1))
      add(i / 2, j / 2, k / 2, (i + j + k) % 2 === 0 ? first : second);
    return out;
  }
  for (const i of r(nx + 1)) for (const j of r(ny + 1)) for (const k of r(nz + 1)) add(i, j, k, first);
  if (p.lattice === 'bcc' || p.lattice === 'cscl') {
    const ion = p.lattice === 'cscl' ? second : first;
    for (const i of r(nx)) for (const j of r(ny)) for (const k of r(nz)) add(i + 0.5, j + 0.5, k + 0.5, ion);
  }
  if (p.lattice === 'fcc') {
    for (const i of r(nx + 1)) for (const j of r(ny)) for (const k of r(nz)) add(i, j + 0.5, k + 0.5, first);
    for (const i of r(nx)) for (const j of r(ny + 1)) for (const k of r(nz)) add(i + 0.5, j, k + 0.5, first);
    for (const i of r(nx)) for (const j of r(ny)) for (const k of r(nz + 1)) add(i + 0.5, j + 0.5, k, first);
  }
  return out;
}

/** Index pairs of points at the nearest-neighbour distance. */
export function latticeBonds(points: readonly LatticePoint[], d: number): [number, number][] {
  const out: [number, number][] = [];
  const tol = d * 0.02;
  for (let i = 0; i < points.length; i++) {
    const p = points[i].pos;
    for (let j = i + 1; j < points.length; j++) {
      const q = points[j].pos;
      if (Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - d) <= tol) out.push([i, j]);
    }
  }
  return out;
}

/** 12 edges of the unit cell at the origin corner. */
export function unitCellEdges(p: CrystalParams): [Vec3, Vec3][] {
  const c = (x: number, y: number, z: number): Vec3 => [x * p.a, y * p.a, z * p.a];
  const corners = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z] as const)));
  const edges: [Vec3, Vec3][] = [];
  for (const u of corners) for (const v of corners) {
    const diff = Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]);
    if (diff === 1 && String(u) < String(v)) edges.push([c(...u), c(...v)]);
  }
  return edges;
}
