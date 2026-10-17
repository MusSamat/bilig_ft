/**
 * Molecule scene params (TZ W-23/W-25, content convention):
 * `atoms[{id, element, position Å}]`, `bonds[{a, b, order}]` (a/b = atom ids),
 * optional `molecules[{id, atoms, bonds}]` for reactions, `formula`,
 * `lonePairs[{atom, count}]`, `shells`, `protons`, `neutrons`, `showNucleus`,
 * or a `preset` (`dna-double-helix`). Legacy `{el, pos}` atoms with index
 * bonds are still accepted. Parsing is lenient: bad entries are dropped.
 */
import { z } from 'zod';
import type { Vec3 } from '@bilig/content-model';
import { element } from './elements.js';

const Vec3S = z.tuple([z.number(), z.number(), z.number()]);
const AtomS = z
  .object({
    id: z.string().min(1).optional(),
    element: z.string().min(1).max(3).optional(),
    el: z.string().min(1).max(3).optional(),
    position: Vec3S.optional(),
    pos: Vec3S.optional(),
    concept: z.string().min(1).optional(),
  })
  .refine((a) => (a.element ?? a.el) && (a.position ?? a.pos));
const BondS = z.object({
  a: z.union([z.string().min(1), z.number().int().min(0)]),
  b: z.union([z.string().min(1), z.number().int().min(0)]),
  order: z.number().int().min(1).max(3).optional(),
  concept: z.string().min(1).optional(),
});
const LonePairS = z.object({ atom: z.string().min(1), count: z.number().int().min(1).max(4) });

export interface Atom {
  id: string;
  el: string;
  pos: Vec3;
  concept?: string;
}
export interface Bond {
  /** Atom ids. */
  a: string;
  b: string;
  order: 1 | 2 | 3;
  concept?: string;
}
export interface Molecule {
  /** Molecule id in reactions (`CH4`, `O2_1`); undefined for a single molecule. */
  id?: string;
  atoms: Atom[];
  bonds: Bond[];
  lonePairs: { atom: string; count: number }[];
}
export interface MoleculeParams {
  formula?: string;
  molecules: Molecule[];
  /** Electrons per shell for a detailed single atom (`[2, 8, 1]`). */
  shells?: number[];
  protons?: number;
  neutrons?: number;
  showNucleus: boolean;
  preset?: string;
  /** Raw params for presets. */
  raw: Record<string, unknown>;
}

const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Bonds by covalent radii: |ab| ≤ (rA + rB) · tolerance. */
export function inferBonds(atoms: readonly Atom[], tolerance = 1.2): Bond[] {
  const out: Bond[] = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const d = dist(atoms[i].pos, atoms[j].pos);
      const max = (element(atoms[i].el).covalent + element(atoms[j].el).covalent) * tolerance;
      if (d > 0.1 && d <= max) out.push({ a: atoms[i].id, b: atoms[j].id, order: 1 });
    }
  }
  return out;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseMolecule(raw: Record<string, unknown>, id?: string): Molecule {
  const atoms: Atom[] = [];
  list(raw.atoms).forEach((a, i) => {
    const r = AtomS.safeParse(a);
    if (!r.success) return;
    const el = (r.data.element ?? r.data.el)!;
    const aid = r.data.id ?? `${el}${i + 1}`;
    if (atoms.some((x) => x.id === aid)) return;
    atoms.push({ id: aid, el, pos: (r.data.position ?? r.data.pos)!, concept: r.data.concept });
  });
  const idOf = (v: string | number) => (typeof v === 'number' ? atoms[v]?.id : atoms.some((a) => a.id === v) ? v : undefined);
  const bonds: Bond[] = Array.isArray(raw.bonds)
    ? raw.bonds.flatMap((b) => {
        const r = BondS.safeParse(b);
        if (!r.success) return [];
        const a = idOf(r.data.a);
        const bb = idOf(r.data.b);
        if (!a || !bb || a === bb) return [];
        return [{ a, b: bb, order: (r.data.order ?? 1) as 1 | 2 | 3, concept: r.data.concept }];
      })
    : inferBonds(atoms);
  const lonePairs = list(raw.lonePairs).flatMap((l) => {
    const r = LonePairS.safeParse(l);
    return r.success && atoms.some((a) => a.id === r.data.atom) ? [r.data] : [];
  });
  return { id, atoms, bonds, lonePairs };
}

const posInt = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 200 ? v : undefined);

export function parseMoleculeParams(input: unknown): MoleculeParams {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const molecules = Array.isArray(raw.molecules)
    ? raw.molecules.flatMap((m, i) => {
        if (!m || typeof m !== 'object') return [];
        const o = m as Record<string, unknown>;
        return [parseMolecule(o, typeof o.id === 'string' && o.id ? o.id : `M${i + 1}`)];
      })
    : [parseMolecule(raw)];
  const shells = Array.isArray(raw.shells) && raw.shells.every((n) => posInt(n) !== undefined) ? (raw.shells as number[]) : undefined;
  return {
    formula: typeof raw.formula === 'string' ? raw.formula : undefined,
    molecules: molecules.filter((m) => m.atoms.length > 0),
    shells,
    protons: posInt(raw.protons),
    neutrons: posInt(raw.neutrons),
    showNucleus: raw.showNucleus === true,
    preset: typeof raw.preset === 'string' ? raw.preset : undefined,
    raw,
  };
}

/** Node-name-safe formula (`CH4 + 2O2 -> …` → `CH4_2O2_…`). */
export const nameSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Ball-and-stick ball = this fraction of the van der Waals radius (Jmol-like, keeps true size ratios). */
export const BALL_FRACTION = 0.23;
/** Space-filling scale of the van der Waals radius (true proportions, slightly shrunk so neighbours stay legible). */
export const SPACEFILL_FRACTION = 0.8;

/** Atom display radius (Å) for a representation: both proportional to the element's van der Waals radius. */
export function atomRadius(el: string, rep: 'ball-stick' | 'spacefill'): number {
  const e = element(el);
  return e.vdw * (rep === 'spacefill' ? SPACEFILL_FRACTION : BALL_FRACTION);
}
