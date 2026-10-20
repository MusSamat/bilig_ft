/**
 * `spring` (physics 7 §18–21: gravity and weight, elastic force, Hooke's law,
 * the dynamometer): a coil spring hangs from a lab stand next to a ruler; the
 * loads are hung on the hook one after another and the spring settles (light
 * damping) at x = m·g/k for the mass hung so far — every load adds the same
 * stretch per kilogram (F = kx). Arrows: the elastic force on the load (up),
 * gravity on the load (down, from its centre) and the weight acting on the
 * hook (down) — equal at rest. Variant `dynamometer` hangs a school spring
 * dynamometer (a plate with a scale in N) instead of the bare spring.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, LABELS, L, MODE, arrowLook, boolOr, clamp, enumOr, fmt, idOr, listOf, niceStep, numOr, obj, on, qty, text, uniqueBy, type SimModel } from './common.js';
import { helixDown, q, sym, u } from './mechCommon.js';

export interface SpringLoad {
  id: string;
  /** kg */
  mass: number;
}
export type SpringVariant = 'hang' | 'dynamometer';
export interface SpringParams {
  /** Stiffness k, N/m. */
  stiffness: number;
  /** Hung on the hook in this order (≤ 5). */
  loads: SpringLoad[];
  g: number;
  showScale: boolean;
  variant: SpringVariant;
}
export const DEFAULT_SPRING: SpringParams = { stiffness: 40, loads: [{ id: 'A', mass: 0.2 }], g: 9.8, showScale: true, variant: 'hang' };
export const MAX_SPRING_LOADS = 5;

export function parseSpringParams(raw: unknown): SpringParams {
  const p = obj(raw);
  const loads = uniqueBy(
    listOf(p.loads, (x) => {
      const o = obj(x);
      const id = idOr(o.id);
      const mass = numOr(o.mass, 1e-4, 1e4, NaN);
      return id && Number.isFinite(mass) ? { id, mass } : null;
    }),
    (l) => l.id,
  ).slice(0, MAX_SPRING_LOADS);
  return {
    stiffness: numOr(p.stiffness, 1e-3, 1e7, DEFAULT_SPRING.stiffness),
    loads: loads.length ? loads : DEFAULT_SPRING.loads,
    g: numOr(p.g, 0.01, 1000, DEFAULT_SPRING.g),
    showScale: boolOr(p.showScale, DEFAULT_SPRING.showScale),
    variant: enumOr(p.variant, ['hang', 'dynamometer'] as const, DEFAULT_SPRING.variant),
  };
}

export interface SpringStage {
  /** Load hung at this stage. */
  id: string;
  /** Total mass on the hook, kg. */
  mass: number;
  /** Weight P = m·g = gravity on the loads, N. */
  weight: number;
  /** Stretch at rest x = m·g/k, m. */
  stretch: number;
  /** Elastic force at rest F = k·x (= P), N. */
  elastic: number;
}

/** One stage per load hung: the totals so far and the stretch where the spring comes to rest. */
export function springStages(p: SpringParams): SpringStage[] {
  let m = 0;
  return p.loads.map((l) => {
    m += l.mass;
    const weight = m * p.g;
    const stretch = weight / p.stiffness;
    return { id: l.id, mass: m, weight, stretch, elastic: p.stiffness * stretch };
  });
}

/** Clock: the first load goes on at `START`, the next every `STAGE` s, then a short hold. */
const START = 1.2;
const STAGE = 3;
const LIFT = 0.7;
const HOLD = 2;
const DAMP = 2.2;
export const springAttachTime = (i: number) => START + i * STAGE;
const cycle = (n: number) => START + n * STAGE + HOLD;

/**
 * Stretch at time t (m): after each load is hung the spring rings down to the
 * new rest stretch (step response of a damped oscillator; shown frequency is
 * the real √(k/m) kept between 0.6 and 2 Hz so it reads on screen).
 */
export function springStretch(p: SpringParams, t: number): number {
  const st = springStages(p);
  let x = 0;
  let prev = 0;
  st.forEach((s, i) => {
    const tau = t - springAttachTime(i);
    const dx = s.stretch - prev;
    prev = s.stretch;
    if (tau <= 0) return;
    const w = clamp(Math.sqrt(p.stiffness / s.mass), 2 * Math.PI * 0.6, 2 * Math.PI * 2);
    x += dx * (1 - Math.exp(-DAMP * tau) * (Math.cos(w * tau) + (DAMP / w) * Math.sin(w * tau)));
  });
  return x;
}

/** Index of the last load hung by time t (−1 before the first). */
export const springStageAt = (n: number, t: number) => {
  let k = -1;
  for (let i = 0; i < n; i++) if (t >= springAttachTime(i)) k = i;
  return k;
};

const SYM = {
  elastic: L('Fсерп', 'Fупр', 'Fel'),
  gravity: L('Fоор', 'Fтяж', 'Fg'),
  weight: L('P', 'P', 'P'),
};
const LOAD_COLORS = ['#c9a227', '#8d99ae', '#e76f51', '#2a9d8f', '#9b5de5'];
const ELASTIC_COLOR = COLORS.normal;
const WEIGHT_COLOR = '#ff9f1c';

export const spring: SimModel = {
  id: 'spring',
  modes: [MODE.vectors(true), LABELS],
  clock(raw, pb, free) {
    const T = cycle(parseSpringParams(raw).loads.length);
    if (pb) return pb.fraction * T;
    return free % T;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parseSpringParams(raw);
    const stages = springStages(p);
    const n = stages.length;
    const last = stages[n - 1];
    const labels = on(modes, 'labels');
    const dyn = p.variant === 'dynamometer';

    // Shown stretch: up to 5 scene units per real metre, the full stretch at most 1.1.
    const K = Math.min(5, 1.1 / Math.max(last.stretch, 1e-9));
    const LS = 0.6; // spring at rest, scene units
    const HOOK = 0.09;
    const heights = p.loads.map((l) => clamp(0.07 + 0.12 * Math.cbrt(l.mass), 0.08, 0.26));
    const radii = p.loads.map((l) => clamp(0.06 + 0.05 * Math.cbrt(l.mass), 0.06, 0.14));
    const stackH = heights.reduce((a, b) => a + b, 0);
    const top = 0.25 + stackH + HOOK + LS + last.stretch * K + 0.15;
    const xs = (t: number) => springStretch(p, t) * K;
    const end = (t: number) => top - LS - xs(t); // lower end of the spring
    const zero = top - LS; // pointer at rest
    const postX = -0.5;
    // Loads wait on the base to the right of the stand until they are hung.
    const waitX = (i: number) => 0.5 + i * 0.24;
    const baseL = postX - 0.22;
    const baseR = Math.max(0.6, waitX(n - 1) + 0.22);
    const parts: Part[] = [
      { name: 'Stand', shape: { kind: 'group' } },
      { name: 'Stand_Base', parent: 'Stand', shape: { kind: 'box', size: [baseR - baseL, 0.04, 0.7], bevel: 0.015 }, position: [(baseL + baseR) / 2, 0.02, 0.05], color: '#3d4654', material: 'plastic' },
      { name: 'Stand_Post', parent: 'Stand', shape: { kind: 'cylinder', radiusTop: 0.018, radiusBottom: 0.018, height: top + 0.1, segments: 20 }, position: [postX, (top + 0.1) / 2, -0.12], color: COLORS.steel, material: 'brushed' },
      { name: 'Stand_Arm', parent: 'Stand', shape: { kind: 'tube', from: [postX, top + 0.04, -0.12], to: [0.03, top + 0.04, 0], radius: 0.014 }, color: COLORS.steel, material: 'brushed' },
      { name: 'Stand_Clamp', parent: 'Stand', shape: { kind: 'box', size: [0.07, 0.07, 0.07], bevel: 0.01 }, position: [postX, top + 0.04, -0.12], color: '#5c6676', material: 'metal', noPick: true },
    ];
    // Spring: a helix of unit length scaled to the current length.
    const coilR = dyn ? 0.04 : 0.055;
    parts.push({ name: 'Spring_At', shape: { kind: 'group' }, position: [0, top, 0], noPick: true, motion: (t) => ({ scale: [1, LS + xs(t), 1] }), scale: [1, LS, 1] });
    parts.push({ name: 'Spring', parent: 'Spring_At', shape: { kind: 'polyline', points: helixDown(16, coilR), radius: 0.006 }, color: '#d9dde3', material: 'metal' });
    parts.push({ name: 'Spring_Ring', shape: { kind: 'torus', radius: 0.03, tube: 0.007, segments: 20 }, position: [0, top + 0.02, 0], color: COLORS.steel, material: 'metal', noPick: true });

    // Hook with the pointer: they ride on the spring's lower end.
    parts.push({ name: 'Hook', shape: { kind: 'group' }, position: [0, end(0), 0], motion: (t) => ({ position: [0, end(t), 0] }) });
    parts.push({ name: 'Hook_Rod', parent: 'Hook', shape: { kind: 'tube', from: [0, 0, 0], to: [0, -HOOK + 0.025, 0], radius: 0.007 }, color: COLORS.steel, material: 'metal' });
    parts.push({ name: 'Hook_Bend', parent: 'Hook', shape: { kind: 'torus', radius: 0.022, tube: 0.007, arc: Math.PI * 1.4, segments: 20 }, position: [0, -HOOK + 0.025, 0], rotation: [0, 0, Math.PI * 0.95], color: COLORS.steel, material: 'metal' });
    const pointerTo = dyn ? 0.15 : 0.27;
    parts.push({ name: 'Pointer', parent: 'Hook', shape: { kind: 'box', size: [pointerTo, 0.012, 0.012] }, position: [pointerTo / 2, 0.003, dyn ? 0.04 : 0], color: '#e63946', material: 'plastic' });
    parts.push({ name: 'Pointer_Tip', parent: 'Hook', shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.016, height: 0.04, segments: 12 }, position: [pointerTo + 0.015, 0.003, dyn ? 0.04 : 0], rotation: [0, 0, -Math.PI / 2], color: '#e63946', material: 'plastic', noPick: true });

    // Loads: wait on the stand base, rise to the hook, then hang below the ones already there.
    p.loads.forEach((l, i) => {
      const h = heights[i];
      const r = radii[i];
      const below = heights.slice(0, i).reduce((a, b) => a + b, 0);
      const hang = (t: number): Vec3 => [0, end(t) - HOOK - below - h / 2, 0];
      const wait: Vec3 = [waitX(i), 0.04 + h / 2, 0.25];
      const t1 = springAttachTime(i);
      const pos = (t: number): Vec3 => {
        if (t >= t1) return hang(t);
        const k = clamp((t - (t1 - LIFT)) / LIFT, 0, 1);
        if (k <= 0) return wait;
        const e = k * k * (3 - 2 * k);
        const to = hang(t1);
        // Swings out in front of the ruler and the pointer on the way.
        return [wait[0] + (to[0] - wait[0]) * e, wait[1] + (to[1] - wait[1]) * e + Math.sin(Math.PI * e) * 0.15, wait[2] + (to[2] - wait[2]) * e + Math.sin(Math.PI * e) * 0.3];
      };
      const N = `Load_${l.id}`;
      parts.push({ name: N, shape: { kind: 'cylinder', radiusTop: r, radiusBottom: r, height: h, segments: 40 }, position: pos(0), color: LOAD_COLORS[i % LOAD_COLORS.length], material: 'copper', motion: (t) => ({ position: pos(t) }) });
      parts.push({ name: `${N}_Slot`, parent: N, shape: { kind: 'box', size: [r * 1.05, h * 1.02, 0.012] }, position: [r * 0.5, 0, 0], color: '#3d3020', material: 'matte', noPick: true });
      parts.push({ name: `${N}_Loop`, parent: N, shape: { kind: 'torus', radius: 0.02, tube: 0.006, segments: 16 }, position: [0, h / 2 + 0.02, 0], color: COLORS.steel, material: 'metal', noPick: true });
      parts.push({ name: `${N}_Ring`, parent: N, shape: { kind: 'torus', radius: 0.018, tube: 0.006, segments: 16 }, position: [0, -h / 2 - 0.016, 0], rotation: [0, Math.PI / 2, 0], color: COLORS.steel, material: 'metal', noPick: true });
      if (labels) parts.push(text(`${N}_Label`, qty(l.mass * 1000, 'g', lang, 0), [0, 0, r + 0.01], Math.min(0.07, h * 0.45), { parent: N, billboard: false, plate: false, color: '#1d1d1d', bold: true }));
    });

    // Ruler beside the pointer: centimetres of real stretch, 0 at the spring's rest end.
    const cmMax = Math.max(5, Math.ceil((last.stretch * 100 + 1) / 5) * 5);
    const cmStep = niceStep(cmMax, 25);
    const yOfCm = (cm: number) => zero - (cm / 100) * K;
    if (p.showScale) {
      const rx = 0.33;
      const y0 = zero + 0.06;
      const y1 = yOfCm(cmMax) - 0.06;
      parts.push({ name: 'Ruler', shape: { kind: 'box', size: [0.1, y0 - y1, 0.015], bevel: 0.004 }, position: [rx, (y0 + y1) / 2, -0.02], color: '#f6e7b4', material: 'wood', textureScale: 2 });
      let i = 0;
      for (let cm = 0; cm <= cmMax + 1e-9; cm += cmStep, i++) {
        const major = Math.abs(cm / (cmStep * 5) - Math.round(cm / (cmStep * 5))) < 1e-6;
        parts.push({ name: `Ruler_Tick_${i}`, parent: 'Ruler', shape: { kind: 'box', size: [major ? 0.05 : 0.028, 0.004, 0.003] }, position: [-0.05 + (major ? 0.025 : 0.014), yOfCm(cm) - (y0 + y1) / 2, 0.009], color: '#212529', noPick: true });
        if (major && labels) parts.push(text(`Ruler_Tick_${i}_Label`, fmt(cm, 1, lang), [0.004, yOfCm(cm) - (y0 + y1) / 2, 0.01], 0.045, { parent: 'Ruler', billboard: false, plate: false, color: '#212529', align: 'left' }));
      }
      if (labels) parts.push(text('Ruler_Unit', u('cm', lang), [0, (y0 - y1) / 2 + 0.06, 0.01], 0.06, { parent: 'Ruler', plate: true }));
    }

    if (dyn) {
      // School spring dynamometer: a blue plate behind the spring with a scale in newtons.
      const y0 = top + 0.08;
      const y1 = Math.min(yOfCm(cmMax), zero - last.stretch * K) - 0.12;
      const plateH = y0 - y1;
      parts.push({ name: 'Dynamometer', shape: { kind: 'box', size: [0.34, plateH, 0.03], bevel: 0.012 }, position: [0.05, (y0 + y1) / 2, -0.07], color: '#3a86ff', material: 'plastic' });
      parts.push({ name: 'Dynamometer_Window', parent: 'Dynamometer', shape: { kind: 'box', size: [0.12, plateH - 0.06, 0.004] }, position: [0.125, 0, 0.017], color: '#f8f9fa', material: 'matte', noPick: true });
      parts.push({ name: 'Dynamometer_Hanger', parent: 'Dynamometer', shape: { kind: 'torus', radius: 0.035, tube: 0.008, segments: 20 }, position: [-0.05, plateH / 2 + 0.04, 0.03], color: COLORS.steel, material: 'metal', noPick: true });
      const Fmax = last.weight;
      const Nstep = niceStep(Fmax || 1, 8);
      const full = Math.max(Nstep * 2, Math.ceil(Fmax / Nstep + 1e-9) * Nstep);
      let i = 0;
      for (let F = 0; F <= full + 1e-9 && i < 40; F += Nstep / 2, i++) {
        const y = zero - (F / p.stiffness) * K - (y0 + y1) / 2;
        if (y < -plateH / 2 + 0.02) break;
        const major = i % 2 === 0;
        const w = major ? 0.06 : 0.035;
        parts.push({ name: `Dynamometer_Tick_${i}`, parent: 'Dynamometer', shape: { kind: 'box', size: [w, 0.005, 0.003] }, position: [0.07 + w / 2, y, 0.021], color: '#1d2b3a', noPick: true });
        if (major && labels) parts.push(text(`Dynamometer_Tick_${i}_Label`, fmt(F, 2, lang), [0.165, y, 0.022], 0.04, { parent: 'Dynamometer', billboard: false, plate: false, color: '#1d2b3a', align: 'right' }));
      }
      parts.push(text('Dynamometer_Unit', u('N', lang), [0.125, plateH / 2 - 0.06, 0.022], 0.05, { parent: 'Dynamometer', billboard: false, plate: false, color: '#1d2b3a', bold: true }));
    }

    // Forces (scene length per newton fixed by the full load).
    if (on(modes, 'vectors')) {
      const kF = 0.75 / Math.max(last.weight, 1e-9);
      const zf = Math.max(...radii) + 0.05;
      const hookAt = (t: number): Vec3 => [0, end(t) - HOOK, zf];
      // Elastic force on the load (up, from where it hangs) and the weight on the hook (down): both k·x(t).
      // An arrow mesh sits at its span's middle, so the motion places the middle (start ± length/2).
      const el = (t: number) => p.stiffness * springStretch(p, t) * kF;
      const visible = (t: number) => t >= springAttachTime(0);
      parts.push({ name: 'Arrow_Elastic', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, 1, 0], radius: 0.022 }, color: ELASTIC_COLOR, ...arrowLook, position: [-0.05, 0, zf], scale: [1, 1e-3, 1], motion: (t) => ({ position: add(hookAt(t), [-0.05, Math.max(1e-3, el(t)) / 2, 0]), scale: [1, Math.max(1e-3, el(t)), 1], visible: visible(t) && el(t) > 0.02 }) });
      parts.push({ name: 'Arrow_Weight', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, -1, 0], radius: 0.022 }, color: WEIGHT_COLOR, ...arrowLook, position: [0.05, 0, zf], scale: [1, 1e-3, 1], motion: (t) => ({ position: add(hookAt(t), [0.05, -Math.max(1e-3, el(t)) / 2, 0]), scale: [1, Math.max(1e-3, el(t)), 1], visible: visible(t) && el(t) > 0.02 }) });
      // Gravity on the loads hung so far: from the centre of the stack, m·g per stage.
      parts.push({ name: 'Arrow_Gravity', shape: { kind: 'group' }, noPick: true, motion: (t) => {
        const k = springStageAt(n, t);
        const below = heights.slice(0, Math.max(0, k) + 1).reduce((a, b) => a + b, 0);
        return { position: [0, end(t) - HOOK - below / 2, zf + 0.01], visible: k >= 0 };
      } });
      stages.forEach((s, i) => {
        const show = (t: number) => ({ visible: springStageAt(n, t) === i });
        const len = s.weight * kF;
        parts.push({ name: `Arrow_Gravity_${i + 1}`, parent: 'Arrow_Gravity', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, -len, 0], radius: 0.022 }, color: COLORS.gravity, ...arrowLook, motion: show });
        if (labels) {
          parts.push(text(`Arrow_Gravity_${i + 1}_Label`, `${sym(SYM.gravity, lang)} = ${qty(s.weight, 'N', lang, 2)}`, [0.42, -len + 0.08, 0], 0.08, { parent: 'Arrow_Gravity', color: COLORS.gravity, motion: show }));
        }
      });
      if (labels) {
        parts.push(text('Arrow_Elastic_Label', sym(SYM.elastic, lang), [-0.2, 0.05, zf], 0.09, { parent: 'Hook', color: ELASTIC_COLOR, bold: true, motion: (t) => ({ visible: visible(t) }) }));
        parts.push(text('Arrow_Weight_Label', sym(SYM.weight, lang), [0.16, -HOOK - 0.12, zf], 0.09, { parent: 'Hook', color: WEIGHT_COLOR, bold: true, motion: (t) => ({ visible: visible(t) }) }));
      }
    }

    // Readout for each stage: what hangs, its weight, the stretch and the elastic force.
    if (labels) {
      const at: Vec3 = [-0.95, top - 0.1, 0];
      parts.push(text('Readout_0', `k = ${q(p.stiffness, 'N/m', lang, 1)}\nx = 0`, at, 0.09, { align: 'right', motion: (t) => ({ visible: springStageAt(n, t) < 0 }) }));
      stages.forEach((s, i) => {
        const lines = [
          `k = ${q(p.stiffness, 'N/m', lang, 1)}`,
          `m = ${qty(s.mass, 'kg', lang, 3)}`,
          `${sym(SYM.gravity, lang)} = P = mg = ${qty(s.weight, 'N', lang, 2)}`,
          `x = ${q(s.stretch * 100, 'cm', lang, 1)}`,
          `${sym(SYM.elastic, lang)} = kx = ${qty(s.elastic, 'N', lang, 2)}`,
        ];
        parts.push(text(`Readout_${i + 1}`, lines.join('\n'), at, 0.09, { align: 'right', motion: (t) => ({ visible: springStageAt(n, t) === i }) }));
      });
    }
    return parts;
  },
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
