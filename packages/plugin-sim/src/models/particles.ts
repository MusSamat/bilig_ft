/**
 * `particles` (5.1 pure substances and mixtures, 5.3 solutions): species of
 * particles in a glass container — mixed, floating on top, settled at the
 * bottom or in a clump; bonded pairs form a compound; temperature sets the
 * speed of thermal motion; `dissolve` spreads a share of a solute through the
 * solvent. «Macro view» shows the same as coloured liquid and layers.
 */
import type { Vec3 } from '@bilig/content-model';
import { conceptColor } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';
import { element } from '@bilig/plugin-molecule';
import {
  LABELS, MODE, beaker, clamp, enumOr, hashStr, idOr, listOf, numOr, obj, on, qty, rng, text, uniqueBy,
  type SimModel,
} from './common.js';

export const PLACES = ['mixed', 'top', 'bottom', 'clump'] as const;
export type Place = (typeof PLACES)[number];

export interface Species {
  id: string;
  element?: string;
  hue?: number;
  count: number;
  /** Relative particle radius (1 = default size). */
  radius: number;
  place: Place;
}
export interface ParticlesParams {
  species: Species[];
  bonded: { a: string; b: string }[];
  /** °C */
  temperature: number;
  /** 0–1: share of a solute already spread through the solvent. */
  dissolve: number;
}
/** At most this many particles per species (and the scene stays light). */
export const MAX_COUNT = 300;
export const DEFAULT_PARTICLES: ParticlesParams = {
  species: [{ id: 'water', hue: 200, count: 80, radius: 1, place: 'mixed' }],
  bonded: [],
  temperature: 20,
  dissolve: 0,
};

export function parseParticlesParams(raw: unknown): ParticlesParams {
  const p = obj(raw);
  const species = uniqueBy(
    listOf(p.species, (x): Species | null => {
      const o = obj(x);
      const id = idOr(o.id);
      const count = numOr(o.count, 0, 1e6, NaN);
      if (!id || !Number.isFinite(count)) return null;
      const el = typeof o.element === 'string' && /^[A-Za-z]{1,2}$/.test(o.element) ? o.element : undefined;
      const hue = numOr(o.hue, 0, 360, NaN);
      return { id, element: el, hue: Number.isFinite(hue) ? hue : undefined, count: Math.min(MAX_COUNT, Math.round(count)), radius: numOr(o.radius, 0.1, 5, 1), place: enumOr(o.place, PLACES, 'mixed') };
    }),
    (s) => s.id,
  );
  const ids = new Set(species.map((s) => s.id));
  const bonded = listOf(p.bonded, (x) => {
    const o = obj(x);
    const a = idOr(o.a);
    const b = idOr(o.b);
    return a && b && a !== b && ids.has(a) && ids.has(b) ? { a, b } : null;
  });
  return {
    species: species.length ? species : DEFAULT_PARTICLES.species,
    bonded: species.length ? bonded : [],
    temperature: numOr(p.temperature, -273.15, 1e4, DEFAULT_PARTICLES.temperature),
    dissolve: numOr(p.dissolve, 0, 1, DEFAULT_PARTICLES.dissolve),
  };
}

/** The solvent: the `mixed` species with the most particles (first on a tie), or null. */
export function solventOf(species: readonly Species[]): string | null {
  let best: Species | null = null;
  for (const s of species) if (s.place === 'mixed' && (!best || s.count > best.count)) best = s;
  return best?.id ?? null;
}

/** Thermal speed factor relative to 20 °C: v ∝ √T (kelvin). */
export const thermalSpeed = (celsius: number) => Math.sqrt(Math.max(0, celsius + 273.15) / 293.15);

/** How many particles of a solid solute (`clump` / `bottom`) are already spread through the solvent. */
export const dissolvedCount = (s: Species, dissolve: number) => (s.place === 'clump' || s.place === 'bottom' ? Math.round(s.count * dissolve) : 0);

const PALETTE = [200, 28, 130, 330, 50, 270];
export function speciesColor(s: Species, i: number): string {
  if (s.element) return element(s.element).color;
  return conceptColor(s.hue ?? PALETTE[i % PALETTE.length], 58, 70);
}

// Container geometry (scene units): a beaker of radius R, the liquid fills up to FILL.
const R = 1;
const HEIGHT = 2.1;
const FILL = 1.55;
const INNER = 0.86;
const BASE_R = 0.065;

interface Placed {
  homes: Vec3[];
  /** Phases and frequencies of the thermal wobble per particle. */
  phase: Float32Array;
  /** Wobble amplitude per particle. */
  amp: Float32Array;
}

function layerThickness(s: Species, total: number): number {
  return clamp(0.12 + (0.9 * s.count) / Math.max(1, total), 0.15, 0.75);
}

function place(s: Species, total: number, dissolve: number, pr: number): Placed {
  const rand = rng(hashStr(s.id));
  const n = s.count;
  const spread = dissolvedCount(s, dissolve);
  const homes: Vec3[] = [];
  const phase = new Float32Array(n * 3);
  const amp = new Float32Array(n);
  const inDisc = (rmax: number): [number, number] => {
    const r = rmax * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  const th = layerThickness(s, total);
  const clumpR = Math.max(pr * 1.6, pr * 1.25 * Math.cbrt(Math.max(1, n - spread)));
  const clumpAt: Vec3 = [0.3, Math.max(clumpR, pr) + 0.08, 0.15];
  for (let i = 0; i < n; i++) {
    const where: Place = i < spread ? 'mixed' : s.place;
    let p: Vec3;
    if (where === 'clump') {
      // Inside a ball: random direction, radius ∝ ∛u for uniform density.
      const u = Math.cbrt(rand()) * clumpR;
      const z = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const q = Math.sqrt(1 - z * z);
      p = [clumpAt[0] + u * q * Math.cos(a), Math.max(pr + 0.07, clumpAt[1] + u * z), clumpAt[2] + u * q * Math.sin(a)];
    } else {
      const [x, z] = inDisc(INNER - pr);
      const y = where === 'top' ? FILL - th + rand() * (th - pr) : where === 'bottom' ? 0.07 + pr + rand() * (th - pr) : 0.07 + pr + rand() * (FILL - 0.07 - 2 * pr);
      p = [x, y, z];
    }
    homes.push(p);
    for (let k = 0; k < 3; k++) phase[i * 3 + k] = rand() * Math.PI * 2;
    // Particles of a solid vibrate in place; those of a liquid wander further.
    amp[i] = where === 'clump' || where === 'bottom' ? pr * 0.18 : where === 'top' ? pr * 1.2 : pr * 2.2;
  }
  return { homes, phase, amp };
}

export const particles: SimModel = {
  id: 'particles',
  modes: [MODE.motion(true), LABELS, MODE.zoom()],
  clock: (_raw, pb, free) => (pb ? pb.time : free),
  build(raw, { modes, lang = 'ru' }) {
    const p = parseParticlesParams(raw);
    const solvent = solventOf(p.species);
    const total = p.species.reduce((n, s) => n + s.count, 0);
    const speed = thermalSpeed(p.temperature);
    const zoom = on(modes, 'zoom');
    const parts: Part[] = [...beaker('Container', [0, 0, 0], R, HEIGHT)];
    // Pour line (graduation) on the glass.
    for (let i = 1; i <= 4; i++) parts.push({ name: `Container_Mark_${i}`, parent: 'Container', shape: { kind: 'box', size: [0.12, 0.008, 0.004] }, position: [0, -HEIGHT / 2 + i * 0.4, R + 0.002], color: '#ffffff', opacity: 0.6, container: true, noPick: true });
    const solventSpecies = p.species.find((s) => s.id === solvent);
    if (solventSpecies) {
      const i = p.species.indexOf(solventSpecies);
      parts.push({ name: 'Solvent', shape: { kind: 'group' } });
      parts.push({
        name: 'Solvent_Liquid', parent: 'Solvent', shape: { kind: 'cylinder', radiusTop: INNER + 0.1, radiusBottom: INNER + 0.1, height: FILL - BASE_R, segments: 48 }, position: [0, BASE_R + (FILL - BASE_R) / 2, 0],
        color: speciesColor(solventSpecies, i), opacity: zoom ? 0.5 : 0.1, container: true, noPick: !zoom,
      });
    }
    if (zoom) {
      parts.push(...macroView(p, solvent, total));
    } else {
      const placed = new Map(p.species.map((s) => [s.id, place(s, total, p.dissolve, 0.06 * s.radius)]));
      // Bonded pairs: the i-th particle of b sits next to the i-th of a and moves with it.
      const partner = new Map<string, { a: Placed; off: Vec3[] }>();
      for (const { a, b } of p.bonded) {
        const A = placed.get(a)!;
        const B = placed.get(b)!;
        const sa = p.species.find((s) => s.id === a)!;
        const sb = p.species.find((s) => s.id === b)!;
        const n = Math.min(A.homes.length, B.homes.length);
        const rand = rng(hashStr(`${a}+${b}`));
        const off: Vec3[] = [];
        for (let i = 0; i < n; i++) {
          const z = rand() * 2 - 1;
          const ang = rand() * Math.PI * 2;
          const q = Math.sqrt(1 - z * z);
          const d = 0.06 * (sa.radius + sb.radius) * 0.85;
          off.push([q * Math.cos(ang) * d, z * d, q * Math.sin(ang) * d]);
          const h = A.homes[i];
          B.homes[i] = [h[0] + off[i][0], h[1] + off[i][1], h[2] + off[i][2]];
        }
        partner.set(b, { a: A, off });
      }
      const wobble = (P: Placed, i: number, t: number): Vec3 => {
        const h = P.homes[i];
        const A = P.amp[i];
        const w = t * speed;
        const ph = P.phase;
        return [
          clamp(h[0] + A * Math.sin(w * 1.7 + ph[i * 3]), -INNER, INNER),
          clamp(h[1] + A * Math.sin(w * 1.3 + ph[i * 3 + 1]), 0.09, FILL - 0.04),
          clamp(h[2] + A * Math.sin(w * 1.9 + ph[i * 3 + 2]), -INNER, INNER),
        ];
      };
      const moving = on(modes, 'motion');
      p.species.forEach((s, i) => {
        const P = placed.get(s.id)!;
        const pair = partner.get(s.id);
        const motion = (t: number, j: number): Vec3 => {
          if (pair && j < pair.off.length) {
            const h = wobble(pair.a, j, t);
            return [h[0] + pair.off[j][0], h[1] + pair.off[j][1], h[2] + pair.off[j][2]];
          }
          return wobble(P, j, t);
        };
        parts.push({
          name: `Species_${s.id}`, parent: s.id === solvent ? 'Solvent' : undefined,
          shape: { kind: 'instances', positions: P.homes, radius: 0.06 * s.radius }, color: speciesColor(s, i), material: 'plastic',
          instanceMotion: moving ? motion : undefined,
        });
      });
    }
    if (on(modes, 'labels')) parts.push(text('Temperature_Label', `t = ${qty(p.temperature, '°C', lang, 0)}`, [R + 0.2, HEIGHT + 0.15, 0], 0.15, { align: 'left' }));
    return parts;
  },
};

/** Macro view: the solvent as liquid, dissolved species as tint, layers on top / at the bottom, clumps as lumps. */
function macroView(p: ParticlesParams, solvent: string | null, total: number): Part[] {
  const out: Part[] = [];
  let bottomY = BASE_R;
  let topY = FILL;
  p.species.forEach((s, i) => {
    if (s.id === solvent) {
      // The solvent is the liquid itself (Solvent_Liquid); its species part is the same volume.
      out.push({ name: `Species_${s.id}`, parent: 'Solvent', shape: { kind: 'group' } });
      return;
    }
    const color = speciesColor(s, i);
    const spread = dissolvedCount(s, p.dissolve);
    const share = s.count / Math.max(1, total);
    const tint = (name: string, k: number): Part => ({
      name, shape: { kind: 'cylinder', radiusTop: INNER + 0.07, radiusBottom: INNER + 0.07, height: FILL - BASE_R - 0.02, segments: 48 },
      position: [0, BASE_R + (FILL - BASE_R) / 2, 0], color, opacity: clamp(0.12 + 0.9 * k, 0.12, 0.6), container: true,
    });
    if (s.place === 'mixed') {
      out.push(tint(`Species_${s.id}`, share));
      return;
    }
    const left = s.count - spread;
    const G = `Species_${s.id}`;
    out.push({ name: G, shape: { kind: 'group' } });
    const th = layerThickness({ ...s, count: left }, total);
    if (s.place === 'top' || s.place === 'bottom') {
      const y = s.place === 'top' ? topY - th / 2 : bottomY + th / 2;
      if (s.place === 'top') topY -= th;
      else bottomY += th;
      out.push({ name: `${G}_Layer`, parent: G, shape: { kind: 'cylinder', radiusTop: INNER + 0.08, radiusBottom: INNER + 0.08, height: th, segments: 48 }, position: [0, y, 0], color, opacity: s.place === 'top' ? 0.75 : 1, container: s.place === 'top', material: s.place === 'bottom' ? 'matte' : undefined });
    } else {
      const r = clamp(0.06 * s.radius * 1.25 * Math.cbrt(Math.max(1, left)), 0.08, 0.6);
      out.push({ name: `${G}_Lump`, parent: G, shape: { kind: 'icosahedron', radius: r, detail: 1 }, position: [0.3, BASE_R + r * 0.8, 0.15], color, material: 'matte' });
    }
    if (spread > 0) out.push({ ...tint(`${G}_Dissolved`, spread / Math.max(1, total)), parent: G, position: [0, BASE_R + (FILL - BASE_R) / 2, 0] });
  });
  return out;
}
