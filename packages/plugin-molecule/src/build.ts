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
import { alignY, basisRotation, rod } from './geom.js';
import { atomRadius, nameSafe, type Molecule, type MoleculeParams } from './params.js';

export type Rep = 'ball-stick' | 'spacefill';

/** Representation from mode state (`rep` group; legacy `repr`). */
export function repFrom(modes: ModeState): Rep {
  const v = modes.rep ?? modes.repr;
  return v === 'spacefill' || v === 'spaceFill' ? 'spacefill' : 'ball-stick';
}

/** Shell radius: detailed single atom uses 1.2·n (scene units), molecules a compact spacing. */
export const shellRadius = (n: number, detailed: boolean, nucleus: number) => (detailed ? 1.2 * n : nucleus + 0.25 + 0.22 * (n - 1));

/** Nucleon radius of the detailed atom (scene units). */
export const NUCLEON_R = 0.15;
const PROTON = '#e5383b';
const NEUTRON = '#8e9aaf';
/** Fallback hues when the topic binds no concept (electrons cyan, valence electrons gold, shells teal). */
const HUE_ELECTRON = 195;
const HUE_VALENCE = 45;
const HUE_SHELL = 190;
const HUE_LONE_PAIR = 55;

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

/**
 * Close-packed nucleus: spiral seed, then a few relaxation rounds (pull to the
 * centre, push touching spheres apart) — deterministic, so nucleons touch like
 * a real liquid-drop picture instead of floating in a cloud.
 */
export function packNucleons(k: number, r: number): Vec3[] {
  if (k <= 1) return k ? [[0, 0, 0]] : [];
  const pts = ballPack(k, r * 1.1 * Math.cbrt(k)).map((p) => [...p] as Vec3);
  const d = 2 * r;
  for (let it = 0; it < 160; it++) {
    const pull = it < 120 ? 0.96 : 1;
    for (const p of pts) for (let a = 0; a < 3; a++) p[a] *= pull;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const v = sub(pts[j], pts[i]);
        const l = len3(v);
        if (l >= d * 0.985) continue;
        const u: Vec3 = l > 1e-6 ? scale3(v, 1 / l) : norm3([Math.sin(i + j), Math.cos(i * 3 + j), Math.sin(j * 7)]);
        const push = (d - l) / 2;
        for (let a = 0; a < 3; a++) {
          pts[i][a] -= u[a] * push;
          pts[j][a] += u[a] * push;
        }
      }
    }
  }
  const c = pts.reduce<Vec3>((s, p) => add(s, scale3(p, 1 / k)), [0, 0, 0]);
  return pts.map((p) => sub(p, c));
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
      parts.push({ name: `Atom_${id}`, parent: group, shape: { kind: 'sphere', radius: atomRadius(a.el, ctx.rep), widthSegments: 48 }, position: a.pos, color: el.color, concept: a.concept, roughness: a.el.toUpperCase() === 'H' ? 0.3 : 0.26 });
      continue;
    }
    // Bohr model: nucleus + shells with electrons.
    const atomGroup = `Atom_${id}`;
    parts.push({ name: atomGroup, parent: group, shape: { kind: 'group' }, position: a.pos, concept: a.concept });
    const protons = detailed ? p.protons ?? el.z : 0;
    const neutrons = detailed ? p.neutrons ?? 0 : 0;
    let nucleusR = 0.16;
    if (protons + neutrons > 0) {
      const total = protons + neutrons;
      const pts = packNucleons(total, NUCLEON_R);
      nucleusR = Math.max(0.2, Math.max(...pts.map((q) => len3(q))) + NUCLEON_R);
      parts.push({ name: `Nucleus_${id}`, parent: atomGroup, shape: { kind: 'group' } });
      let np = 0;
      let nn = 0;
      pts.forEach((pos, i) => {
        // Even mix: a proton whenever the running proton share falls behind.
        const isProton = np < protons && (nn >= neutrons || Math.floor(((i + 1) * protons) / total) > np);
        const k = isProton ? ++np : ++nn;
        parts.push({ name: `${isProton ? 'Proton' : 'Neutron'}_${id}_${k}`, parent: `Nucleus_${id}`, shape: { kind: 'sphere', radius: NUCLEON_R, widthSegments: 24 }, position: pos, color: isProton ? PROTON : NEUTRON, roughness: 0.28 });
      });
    } else {
      parts.push({ name: `Nucleus_${id}`, parent: atomGroup, shape: { kind: 'sphere', radius: nucleusR, widthSegments: 32 }, color: el.color, glow: 0.15, roughness: 0.3 });
    }
    const config = detailed && p.shells ? p.shells : shellConfig(el.z);
    let electron = 0;
    config.forEach((count, s) => {
      const n = s + 1;
      const outer = s === config.length - 1;
      const r = shellRadius(n, detailed, nucleusR);
      // Orbits face the camera (tilted back so they read as rings, not lines), each a little turned.
      const tilt: Vec3 = detailed ? [-0.5, (s - (config.length - 1) / 2) * 0.16, 0] : [-0.45, 0.25 * s, 0];
      parts.push({ name: `Shell_${id}_${n}`, parent: atomGroup, shape: { kind: 'torus', radius: r, tube: detailed ? 0.028 : 0.01 }, rotation: tilt, hue: HUE_SHELL, opacity: detailed ? 0.55 : 0.4, container: true });
      const spin = `ShellSpin_${id}_${n}`;
      const speed = 1.2 / n;
      parts.push({ name: spin, parent: atomGroup, shape: { kind: 'group' }, rotation: tilt, noPick: true, motion: ctx.animate ? (t) => ({ rotation: [tilt[0], tilt[1], t * speed] as Vec3 }) : undefined });
      // Inner shells start half a step round so electrons of different shells don't line up.
      const phase = outer ? 0 : Math.PI / count;
      const er = detailed ? 0.15 : 0.05;
      for (let k = 0; k < count; k++) {
        electron++;
        const ang = phase + (k / count) * Math.PI * 2;
        const name = `Electron_${id}_${electron}`;
        parts.push({ name, parent: spin, shape: { kind: 'sphere', radius: er, widthSegments: 20 }, position: [Math.cos(ang) * r, Math.sin(ang) * r, 0], hue: outer ? HUE_VALENCE : HUE_ELECTRON, glow: 0.9, roughness: 0.2 });
        // Soft glow shell (binds through its parent; also a larger hit area for a tiny electron).
        parts.push({ name: `Glow_${id}_${electron}`, parent: name, shape: { kind: 'sphere', radius: er * 1.6, widthSegments: 24 }, hue: outer ? HUE_VALENCE : HUE_ELECTRON, glow: 1, container: true, opacity: 0.22 });
      }
    });
  }
  return parts;
}

/** Bond stick radius (Å) for one line of a bond of the given order. */
export const bondRadius = (order: 1 | 2 | 3) => (order === 1 ? 0.085 : order === 2 ? 0.058 : 0.046);
const bondOffsets = (order: 1 | 2 | 3) => (order === 1 ? [0] : order === 2 ? [-0.09, 0.09] : [-0.125, 0, 0.125]);

/**
 * Bonds: one line per bond order (double/triple as parallel sticks), each
 * split in two halves coloured like their atoms (CPK split colouring).
 * `Bond_<a>_<b>` is a group; halves `…_a`/`…_b` (single) or `…_<k>a`/`…_<k>b`.
 */
function bondParts(mol: Molecule, ctx: Ctx, group: string, prefix: string): Part[] {
  if (ctx.rep !== 'ball-stick' || ctx.shells) return [];
  const byId = new Map(mol.atoms.map((a) => [a.id, a]));
  const parts: Part[] = [];
  for (const b of mol.bonds) {
    const A = byId.get(b.a)!;
    const B = byId.get(b.b)!;
    const pa = A.pos;
    const pb = B.pos;
    const ra = atomRadius(A.el, 'ball-stick');
    const rb = atomRadius(B.el, 'ball-stick');
    const dir = norm3(sub(pb, pa));
    const L = len3(sub(pb, pa));
    // Offset sideways in the view plane (z ⟂) so double/triple bonds read from the front.
    const side = norm3(cross3(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const name = `Bond_${prefix}${b.a}_${b.b}`;
    parts.push({ name, parent: group, shape: { kind: 'group' }, concept: b.concept });
    const offsets = bondOffsets(b.order);
    const r = bondRadius(b.order);
    offsets.forEach((o, k) => {
      const d = scale3(side, o);
      // Start each stick just inside the atom surface (no stick inside a dimmed, see-through atom).
      const inA = Math.sqrt(Math.max(0, ra * ra - o * o)) * 0.85;
      const inB = Math.sqrt(Math.max(0, rb * rb - o * o)) * 0.85;
      const from = add(add(pa, scale3(dir, inA)), d);
      const to = add(add(pa, scale3(dir, L - inB)), d);
      const split = add(add(pa, scale3(dir, (inA + L - inB) / 2)), d);
      const tag = offsets.length === 1 ? '_' : `_${k + 1}`;
      parts.push(rod(`${name}${tag}a`, name, from, split, { radius: r, color: element(A.el).color, segments: 24, roughness: 0.3 }));
      parts.push(rod(`${name}${tag}b`, name, split, to, { radius: r, color: element(B.el).color, segments: 24, roughness: 0.3 }));
    });
  }
  return parts;
}

const lobeLength = (rep: Rep) => (rep === 'spacefill' ? 0.5 : 0.52);

/**
 * Lone pairs: a translucent lobe pointing away from the bonds with its two
 * electrons inside (`LonePair_<atom>_<k>` group; `…_lobe`, `…_e1`, `…_e2`).
 */
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
    let normal: Vec3;
    if (bonded.length >= 2 && len3(cross3(bonded[0], bonded[1])) > 1e-6) {
      // Lone pairs sit out of the bond plane (tetrahedral); lean them ~35° into it so a front view shows both ears.
      const outOfPlane = norm3(cross3(bonded[0], bonded[1]));
      const inPlane = norm3(cross3(outOfPlane, dir));
      normal = norm3(add(scale3(outOfPlane, Math.cos(0.6)), scale3(inPlane, Math.sin(0.6))));
    } else {
      // Terminal or lone atom: fan the pairs in the view plane.
      normal = norm3(cross3(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    }
    // Tetrahedral-ish spread (±~55°) for two pairs, fan for more.
    const spread = lp.count === 1 ? [0] : Array.from({ length: lp.count }, (_, k) => -0.95 + (1.9 * k) / (lp.count - 1));
    const rAtom = atomRadius(atom.el, ctx.rep);
    const lobeLen = lobeLength(ctx.rep);
    spread.forEach((s, k) => {
      const v = norm3(add(scale3(dir, Math.cos(s)), scale3(normal, Math.sin(s))));
      const name = `LonePair_${prefix}${atom.id}_${k + 1}`;
      const rot = alignY(v);
      parts.push({ name, parent: group, shape: { kind: 'group' }, position: add(atom.pos, scale3(v, rAtom * 0.92 + lobeLen * 0.5)), rotation: rot });
      parts.push({ name: `${name}_lobe`, parent: name, shape: { kind: 'sphere', radius: lobeLen * 0.5, widthSegments: 32 }, scale: [0.72, 1, 0.72], hue: HUE_LONE_PAIR, container: true, opacity: 0.45 });
      for (const e of [1, 2]) {
        parts.push({ name: `${name}_e${e}`, parent: name, shape: { kind: 'sphere', radius: 0.06, widthSegments: 16 }, position: [(e === 1 ? -1 : 1) * lobeLen * 0.16, lobeLen * 0.06, 0], hue: HUE_LONE_PAIR, glow: 0.9 });
      }
    });
  }
  return parts;
}

/**
 * Translucent hull for a molecule group bound to a container concept
 * (clickable around the atoms): an ellipsoid fitted to the drawn atoms (and
 * lone pairs), so it hugs a linear CO₂ as well as a tetrahedral CH₄.
 */
function hull(mol: Molecule, group: string, ctx: Ctx, lonePairs: readonly Part[]): Part[] {
  if (!conceptForNode(group, ctx.concepts)) return [];
  const c = mol.atoms.reduce<Vec3>((s, a) => add(s, scale3(a.pos, 1 / mol.atoms.length)), [0, 0, 0]);
  const blobs: [Vec3, number][] = mol.atoms.map((a) => [a.pos, ctx.shells ? shellRadius(shellConfig(element(a.el).z).length, false, 0.16) : atomRadius(a.el, ctx.rep)]);
  for (const lp of lonePairs) if (lp.shape.kind === 'group' && lp.position) blobs.push([lp.position, lobeLength(ctx.rep) * 0.5]);
  const ext: Vec3 = [0, 0, 0];
  for (const [pos, r] of blobs) for (let k = 0; k < 3; k++) ext[k] = Math.max(ext[k], Math.abs(pos[k] - c[k]) + r);
  const pad = ctx.rep === 'spacefill' ? 0.16 : 0.26;
  const scale = ext.map((e) => (e + pad) * 1.06) as Vec3;
  return [{ name: `${group}_Hull`, parent: group, shape: { kind: 'sphere', radius: 1, widthSegments: 48 }, position: c, scale, opacity: 0.07, container: true }];
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
    const lone = lonePairParts(mol, ctx, group, prefix);
    parts.push(...atomParts(mol, p, ctx, group, prefix), ...bondParts(mol, ctx, group, prefix), ...lone, ...hull(mol, group, ctx, lone));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// DNA double helix preset (units nm, axis along Y, centred at the origin).
// ---------------------------------------------------------------------------

/** Nucleobase colours (A red, T amber, G green, C blue — the common textbook key). */
export const BASE_COLOR: Record<string, string> = { A: '#e63946', T: '#f4a52a', G: '#2bb673', C: '#2f7fd8' };
const PARTNER: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
const PHOSPHATE = '#ff9a1f';
const SUGAR = '#e9dcc6';
const STRAND = ['#d9dee7', '#b9c6da'] as const;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);

/**
 * B-DNA: right-handed, 10.5 bp per turn, rise 0.34 nm, phosphates at radius
 * ~1 nm. The second strand trails by ~126°, which opens the minor groove
 * (~1.2 nm) and the major groove (~2.2 nm) along the axis. Each nucleotide
 * is a phosphate bead on a smooth backbone, a pentagonal deoxyribose and a
 * flat base slab (purines longer than pyrimidines); paired slabs meet near
 * the axis, joined by 2 (A–T) or 3 (G–C) hydrogen bonds.
 */
export function buildDnaParts(raw: Record<string, unknown>, rep: Rep): Part[] {
  const seq = (typeof raw.sequence === 'string' ? raw.sequence.toUpperCase().replace(/[^ATGC]/g, '') : '') || 'ATGC';
  const n = Math.min(60, Math.round(num(raw.basePairs, seq.length)));
  const rise = num(raw.rise, 0.34);
  const perTurn = num(raw.basePairsPerTurn, 10.5);
  const R = num(raw.diameter, 2) / 2;
  const offset = Math.PI * 0.7; // minor groove ≈ 0.35 of the pitch
  const thick = rep === 'spacefill';
  const sub3 = n > 24 ? 3 : 5; // backbone smoothness (segments per step)
  const y0 = -((n - 1) / 2) * rise;
  const angle = (i: number, strand: 0 | 1) => (2 * Math.PI * i) / perTurn + (strand ? offset : 0);
  const onHelix = (i: number, strand: 0 | 1, r: number): Vec3 => {
    const a = angle(i, strand);
    // (x, −z) is a right-handed frame with y up, so the helix is right-handed like B-DNA.
    return [Math.cos(a) * r, y0 + i * rise, -Math.sin(a) * r];
  };
  const radial = (a: number): Vec3 => [Math.cos(a), 0, -Math.sin(a)];
  const rBack = thick ? 0.17 : 0.085;
  const rP = thick ? 0.25 : 0.15;
  const rSugarRing = thick ? 0.2 : 0.14;
  const sugarR = R * 0.7;
  const slabT = thick ? 0.3 : 0.11;
  const slabW = thick ? 0.36 : 0.3;

  const parts: Part[] = [
    { name: 'Helix', shape: { kind: 'cylinder', radiusTop: 0.016, radiusBottom: 0.016, height: n * rise + 0.5, segments: 16 }, color: '#aab3c2', roughness: 0.4 },
  ];
  for (let i = 0; i < n; i++) {
    const base = seq[i % seq.length];
    const pairKind = base === 'A' || base === 'T' ? 'AT' : 'GC';
    const sugars: Vec3[] = [];
    for (const strand of [0, 1] as const) {
      const s = strand ? 'B' : 'A';
      const a = angle(i, strand);
      const P = onHelix(i, strand, R);
      const S = add(scale3(radial(a), sugarR), [0, P[1], 0]);
      sugars.push(S);
      // Nucleotide = phosphate bead + deoxyribose ring (its base belongs to the pair).
      const nuc = `Nucleotide_${s}_${i + 1}`;
      parts.push({ name: nuc, shape: { kind: 'group' } });
      parts.push({ name: `${nuc}_P`, parent: nuc, shape: { kind: 'sphere', radius: rP, widthSegments: 32 }, position: P, color: PHOSPHATE, roughness: 0.3 });
      parts.push({ name: `${nuc}_S`, parent: nuc, shape: { kind: 'cylinder', radiusTop: rSugarRing, radiusBottom: rSugarRing, height: thick ? 0.2 : 0.07, segments: 5 }, position: S, rotation: [0, a, 0], color: SUGAR, roughness: 0.35 });
      parts.push(rod(`${nuc}_PS`, nuc, P, S, { radius: rBack * 0.55, color: SUGAR, segments: 16, roughness: 0.35 }));
      // Smooth helical backbone to the next phosphate.
      if (i + 1 < n) {
        const bb = `Backbone_${s}_${i + 1}`;
        parts.push({ name: bb, shape: { kind: 'group' } });
        for (let k = 0; k < sub3; k++) {
          const f0 = i + k / sub3;
          const f1 = i + (k + 1) / sub3;
          const ext = 0.004;
          parts.push(rod(`${bb}_${k + 1}`, bb, onHelix(f0 - ext, strand, R), onHelix(f1 + ext, strand, R), { radius: rBack, color: STRAND[strand], segments: 20, roughness: 0.3 }));
        }
      }
    }
    // Base pair: two slabs from the sugars meeting near the axis.
    const [sa, sb] = sugars;
    const across = norm3(sub(sb, sa));
    const span = len3(sub(sb, sa));
    const purine = base === 'A' || base === 'G';
    const gap = thick ? 0.02 : 0.14;
    // Purines (two rings) take the larger share of the span.
    const split = add(sa, scale3(across, span * (purine ? 0.56 : 0.44)));
    const ends: [Vec3, Vec3][] = [
      [sa, add(split, scale3(across, -gap / 2))],
      [add(split, scale3(across, gap / 2)), sb],
    ];
    const pair = `Pair_${pairKind}_${i + 1}`;
    parts.push({ name: pair, shape: { kind: 'group' } });
    const up: Vec3 = [0, 1, 0];
    const width = norm3(cross3(across, up));
    const rot = basisRotation(across, up, width);
    const letters = [base, PARTNER[base]];
    ends.forEach(([f, t], k) => {
      const lenS = len3(sub(t, f));
      parts.push({ name: `${pair}_${k ? 'B' : 'A'}`, parent: pair, shape: { kind: 'box', size: [lenS, slabT, slabW] }, position: mid3(f, t), rotation: rot, color: BASE_COLOR[letters[k]], roughness: 0.32 });
    });
    const hbonds = pairKind === 'AT' ? 2 : 3;
    for (let k = 0; k < hbonds; k++) {
      const w = (k - (hbonds - 1) / 2) * (slabW / hbonds) * 0.95;
      const o = scale3(width, w);
      const h0 = add(add(split, scale3(across, -gap / 2 - 0.01)), o);
      const h1 = add(add(split, scale3(across, gap / 2 + 0.01)), o);
      parts.push(rod(`HBond_${i + 1}_${k + 1}`, undefined, h0, h1, { radius: thick ? 0.03 : 0.018, color: '#f2f6ff', segments: 10, roughness: 0.4 }));
    }
  }
  return parts;
}
