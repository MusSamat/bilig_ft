/**
 * Molecule scene as named parts (content convention): `Atom_<id>`,
 * `Bond_<a>_<b>`, `Shell_<atomId>_<n>`, `Nucleus_<atomId>`,
 * `Proton_<atomId>_<k>`, `Neutron_<atomId>_<k>`, `Electron_<atomId>_<k>`,
 * `LonePair_<atomId>_<k>`, molecule groups `Molecule_<formula>` / `Mol_<id>`,
 * and for the DNA preset `Helix`, `Backbone_*`, `Nucleotide_*`, `Pair_AT_*`,
 * `Pair_GC_*`, `HBond_*`.
 */
import { conceptForNode, type ResolvedConcept, type Vec3 } from '@bilig/content-model';
import type { ModeState } from '@bilig/scene-core';
import { add, cross3, len3, mid3, norm3, scale3, sub, type Part } from '@bilig/scene-kit';
import { element, shellConfig } from './elements.js';
import { atomRadius, nameSafe, type Molecule, type MoleculeParams } from './params.js';

export type Rep = 'ball-stick' | 'spacefill';

/** Representation from mode state (`rep` group; legacy `repr`). */
export function repFrom(modes: ModeState): Rep {
  const v = modes.rep ?? modes.repr;
  return v === 'spacefill' || v === 'spaceFill' ? 'spacefill' : 'ball-stick';
}

/** Shell radius: detailed single atom uses 1.2·n (scene units), molecules a compact spacing. */
export const shellRadius = (n: number, detailed: boolean, nucleus: number) => (detailed ? 1.2 * n : nucleus + 0.25 + 0.22 * (n - 1));

const NUCLEON_R = 0.12;

/** Golden-spiral packing of k points in a ball of radius r. */
function ballPack(k: number, r: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: k }, (_, i) => {
    const y = 1 - ((i + 0.5) / k) * 2;
    const rr = Math.sqrt(1 - y * y);
    const rad = r * Math.cbrt((i + 0.5) / k);
    return [Math.cos(golden * i) * rr * rad, y * rad, Math.sin(golden * i) * rr * rad] as Vec3;
  });
}

interface Ctx {
  rep: Rep;
  shells: boolean;
  animate: boolean;
  concepts: readonly ResolvedConcept[];
}

function atomParts(mol: Molecule, p: MoleculeParams, ctx: Ctx, group: string, prefix: string): Part[] {
  const parts: Part[] = [];
  const detailed = p.molecules.length === 1 && mol.atoms.length === 1 && (!!p.shells || p.showNucleus);
  for (const a of mol.atoms) {
    const el = element(a.el);
    const id = `${prefix}${a.id}`;
    if (!ctx.shells) {
      parts.push({ name: `Atom_${id}`, parent: group, shape: { kind: 'sphere', radius: atomRadius(a.el, ctx.rep), widthSegments: 40 }, position: a.pos, color: el.color, concept: a.concept, roughness: 0.35 });
      continue;
    }
    // Bohr model: nucleus + shells with electrons.
    const atomGroup = `Atom_${id}`;
    parts.push({ name: atomGroup, parent: group, shape: { kind: 'group' }, position: a.pos, concept: a.concept });
    const protons = detailed ? p.protons ?? el.z : 0;
    const neutrons = detailed ? p.neutrons ?? 0 : 0;
    let nucleusR = 0.16;
    if (protons + neutrons > 0) {
      nucleusR = Math.max(0.2, NUCLEON_R * 1.25 * Math.cbrt(protons + neutrons));
      parts.push({ name: `Nucleus_${id}`, parent: atomGroup, shape: { kind: 'group' } });
      ballPack(protons + neutrons, nucleusR - NUCLEON_R).forEach((pos, i) => {
        const isProton = i % 2 === 0 ? i / 2 < protons : (i - 1) / 2 >= neutrons;
        const k = isProton ? parts.filter((x) => x.name.startsWith(`Proton_${id}_`)).length + 1 : parts.filter((x) => x.name.startsWith(`Neutron_${id}_`)).length + 1;
        parts.push({ name: `${isProton ? 'Proton' : 'Neutron'}_${id}_${k}`, parent: `Nucleus_${id}`, shape: { kind: 'sphere', radius: NUCLEON_R, widthSegments: 16 }, position: pos, color: isProton ? '#ef476f' : '#adb5bd' });
      });
    } else {
      parts.push({ name: `Nucleus_${id}`, parent: atomGroup, shape: { kind: 'sphere', radius: nucleusR }, color: el.color, glow: 0.2 });
    }
    const config = detailed && p.shells ? p.shells : shellConfig(el.z);
    let electron = 0;
    config.forEach((count, s) => {
      const n = s + 1;
      const r = shellRadius(n, detailed, nucleusR);
      const tilt: Vec3 = [Math.PI / 2 + 0.25 * s, 0, 0];
      parts.push({ name: `Shell_${id}_${n}`, parent: atomGroup, shape: { kind: 'torus', radius: r, tube: detailed ? 0.02 : 0.008 }, rotation: tilt, color: '#9ad1d4', opacity: 0.35, container: true });
      const spin = `ShellSpin_${id}_${n}`;
      const speed = 1.2 / n;
      parts.push({ name: spin, parent: atomGroup, shape: { kind: 'group' }, rotation: tilt, noPick: true, motion: ctx.animate ? (t) => ({ rotation: [tilt[0], 0, t * speed] as Vec3 }) : undefined });
      for (let k = 0; k < count; k++) {
        electron++;
        const ang = (k / count) * Math.PI * 2;
        parts.push({ name: `Electron_${id}_${electron}`, parent: spin, shape: { kind: 'sphere', radius: detailed ? 0.12 : 0.04, widthSegments: 12 }, position: [Math.cos(ang) * r, Math.sin(ang) * r, 0], color: '#4cc9f0', glow: 0.8 });
      }
    });
  }
  return parts;
}

function bondParts(mol: Molecule, ctx: Ctx, group: string, prefix: string): Part[] {
  if (ctx.rep !== 'ball-stick' || ctx.shells) return [];
  const pos = new Map(mol.atoms.map((a) => [a.id, a.pos]));
  const parts: Part[] = [];
  for (const b of mol.bonds) {
    const pa = pos.get(b.a)!;
    const pb = pos.get(b.b)!;
    const dir = norm3(sub(pb, pa));
    const side = norm3(cross3(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const offsets = b.order === 1 ? [0] : b.order === 2 ? [-0.07, 0.07] : [-0.1, 0, 0.1];
    const name = `Bond_${prefix}${b.a}_${b.b}`;
    if (offsets.length === 1) {
      parts.push({ name, parent: group, shape: { kind: 'tube', from: pa, to: pb, radius: 0.08 }, color: '#c9ced6', concept: b.concept });
      continue;
    }
    parts.push({ name, parent: group, shape: { kind: 'group' }, concept: b.concept });
    offsets.forEach((o, k) => {
      const d = scale3(side, o);
      parts.push({ name: `${name}_${k + 1}`, parent: name, shape: { kind: 'tube', from: add(pa, d), to: add(pb, d), radius: 0.045 }, color: '#c9ced6' });
    });
  }
  return parts;
}

function lonePairParts(mol: Molecule, ctx: Ctx, group: string, prefix: string): Part[] {
  const parts: Part[] = [];
  for (const lp of mol.lonePairs) {
    const atom = mol.atoms.find((a) => a.id === lp.atom)!;
    const bonded = mol.bonds
      .filter((b) => b.a === atom.id || b.b === atom.id)
      .map((b) => mol.atoms.find((a) => a.id === (b.a === atom.id ? b.b : b.a))!)
      .map((o) => norm3(sub(o.pos, atom.pos)));
    const sum = bonded.reduce<Vec3>((s, v) => add(s, v), [0, 0, 0]);
    const dir: Vec3 = len3(sum) > 1e-6 ? norm3(scale3(sum, -1)) : [0, 1, 0];
    const normal: Vec3 = bonded.length >= 2 && len3(cross3(bonded[0], bonded[1])) > 1e-6 ? norm3(cross3(bonded[0], bonded[1])) : norm3(cross3(dir, [1, 0, 0]));
    const spread = lp.count === 1 ? [0] : Array.from({ length: lp.count }, (_, k) => -0.95 + (1.9 * k) / (lp.count - 1));
    const reach = ctx.rep === 'spacefill' ? 1.25 : 0.6;
    spread.forEach((s, k) => {
      const v = norm3(add(scale3(dir, Math.cos(s)), scale3(normal, Math.sin(s))));
      parts.push({ name: `LonePair_${prefix}${atom.id}_${k + 1}`, parent: group, shape: { kind: 'sphere', radius: 0.17, widthSegments: 20 }, position: add(atom.pos, scale3(v, reach)), scale: [0.8, 0.8, 0.8], color: '#80ffdb', opacity: 0.75, container: false });
    });
  }
  return parts;
}

/** Translucent hull for a molecule group bound to a container concept (clickable around the atoms). */
function hull(mol: Molecule, group: string, ctx: Ctx): Part[] {
  if (!conceptForNode(group, ctx.concepts)) return [];
  const c = mol.atoms.reduce<Vec3>((s, a) => add(s, scale3(a.pos, 1 / mol.atoms.length)), [0, 0, 0]);
  const r = Math.max(...mol.atoms.map((a) => len3(sub(a.pos, c)) + element(a.el).vdw * 0.8)) * 1.05;
  return [{ name: `${group}_Hull`, parent: group, shape: { kind: 'sphere', radius: r, widthSegments: 32 }, position: c, opacity: 0.06, container: true }];
}

export interface BuildOptions {
  modes: ModeState;
  concepts?: readonly ResolvedConcept[];
  animate?: boolean;
}

export function buildMoleculeParts(p: MoleculeParams, opts: BuildOptions): Part[] {
  const ctx: Ctx = { rep: repFrom(opts.modes), shells: opts.modes.shells === true, animate: opts.animate ?? true, concepts: opts.concepts ?? [] };
  if (p.preset === 'dna-double-helix') return buildDnaParts(p.raw, ctx.rep);
  const parts: Part[] = [];
  const multi = p.molecules.length > 1 || p.molecules[0]?.id !== undefined;
  for (const mol of p.molecules) {
    const group = multi ? `Mol_${nameSafe(mol.id ?? 'M')}` : `Molecule_${nameSafe(p.formula ?? 'M')}`;
    const prefix = multi ? `${nameSafe(mol.id ?? 'M')}_` : '';
    parts.push({ name: group, shape: { kind: 'group' } });
    parts.push(...atomParts(mol, p, ctx, group, prefix), ...bondParts(mol, ctx, group, prefix), ...lonePairParts(mol, ctx, group, prefix), ...hull(mol, group, ctx));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// DNA double helix preset (units nm, axis along Y, centred at the origin).
// ---------------------------------------------------------------------------

const BASE_COLOR: Record<string, string> = { A: '#ef476f', T: '#ffd166', G: '#06d6a0', C: '#118ab2' };
const PARTNER: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);

export function buildDnaParts(raw: Record<string, unknown>, rep: Rep): Part[] {
  const seq = (typeof raw.sequence === 'string' ? raw.sequence.toUpperCase().replace(/[^ATGC]/g, '') : '') || 'ATGC';
  const n = Math.min(60, Math.round(num(raw.basePairs, seq.length)));
  const rise = num(raw.rise, 0.34);
  const perTurn = num(raw.basePairsPerTurn, 10.5);
  const R = num(raw.diameter, 2) / 2;
  const offset = Math.PI * 0.8; // minor/major groove asymmetry
  const thick = rep === 'spacefill';
  const at = (i: number, strand: 0 | 1): Vec3 => {
    const a = (2 * Math.PI * i) / perTurn + (strand ? offset : 0);
    return [Math.cos(a) * R, (i - (n - 1) / 2) * rise, Math.sin(a) * R];
  };
  const parts: Part[] = [
    { name: 'Helix', shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: n * rise + 0.4, segments: 12 }, color: '#adb5bd', opacity: 0.5 },
  ];
  for (let i = 0; i < n; i++) {
    const base = seq[i % seq.length];
    const pairKind = base === 'A' || base === 'T' ? 'AT' : 'GC';
    for (const strand of [0, 1] as const) {
      const s = strand ? 'B' : 'A';
      const p = at(i, strand);
      parts.push({ name: `Nucleotide_${s}_${i + 1}`, shape: { kind: 'sphere', radius: thick ? 0.22 : 0.12, widthSegments: 16 }, position: p, color: '#e9c46a' });
      if (i + 1 < n) parts.push({ name: `Backbone_${s}_${i + 1}`, shape: { kind: 'tube', from: p, to: at(i + 1, strand), radius: thick ? 0.1 : 0.05 }, color: '#f4a261' });
    }
    const pa = at(i, 0);
    const pb = at(i, 1);
    const m = mid3(pa, pb);
    const dir = norm3(sub(pb, pa));
    const gap = 0.06;
    const r = thick ? 0.11 : 0.06;
    parts.push({ name: `Pair_${pairKind}_${i + 1}`, shape: { kind: 'group' } });
    parts.push({ name: `Pair_${pairKind}_${i + 1}_A`, parent: `Pair_${pairKind}_${i + 1}`, shape: { kind: 'tube', from: pa, to: add(m, scale3(dir, -gap)), radius: r }, color: BASE_COLOR[base] });
    parts.push({ name: `Pair_${pairKind}_${i + 1}_B`, parent: `Pair_${pairKind}_${i + 1}`, shape: { kind: 'tube', from: add(m, scale3(dir, gap)), to: pb, radius: r }, color: BASE_COLOR[PARTNER[base]] });
    const hbonds = pairKind === 'AT' ? 2 : 3;
    for (let k = 0; k < hbonds; k++) {
      const dy: Vec3 = [0, (k - (hbonds - 1) / 2) * 0.05, 0];
      parts.push({ name: `HBond_${i + 1}_${k + 1}`, shape: { kind: 'tube', from: add(add(m, scale3(dir, -gap)), dy), to: add(add(m, scale3(dir, gap)), dy), radius: 0.012 }, color: '#f8f9fa' });
    }
  }
  return parts;
}
