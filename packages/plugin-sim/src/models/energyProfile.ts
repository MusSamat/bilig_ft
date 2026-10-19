/**
 * `energy-profile` (7.1 exothermic, 7.2 endothermic): the energy diagram of a
 * reaction (reactant and product levels, the activation hump, ΔH and Ea
 * arrows) and, in «temperature» mode, a beaker with a thermometer and the
 * T(t) curve: it moves by ΔT while the reaction runs, then relaxes back to
 * room temperature.
 */
import type { Lang } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, L, LABELS, MODE, beaker, boolOr, clamp, enumOr, fmt, growingSegment, liquid, numOr, obj, on, qty, smooth, text, tr, unit,
  type SimModel,
} from './common.js';

export const KINDS = ['exo', 'endo'] as const;
export type ReactionKind = (typeof KINDS)[number];

export interface EnergyProfileParams {
  kind: ReactionKind;
  /** kJ */
  reactants: number;
  /** kJ */
  products: number;
  /** Peak above the reactants, kJ. */
  activation: number;
  /** °C (room temperature: the mixture starts and ends there). */
  startTemp: number;
  /** °C, signed. */
  deltaT: number;
  compare: boolean;
}

export const kindDefaults = (kind: ReactionKind) => ({ products: kind === 'exo' ? 40 : 160, deltaT: kind === 'exo' ? 25 : -10 });

export function parseEnergyProfileParams(raw: unknown): EnergyProfileParams {
  const p = obj(raw);
  const kind = enumOr(p.kind, KINDS, 'exo');
  const d = kindDefaults(kind);
  return {
    kind,
    reactants: numOr(p.reactants, 0, 1e6, 100),
    products: numOr(p.products, 0, 1e6, d.products),
    activation: numOr(p.activation, 0, 1e6, 60),
    startTemp: numOr(p.startTemp, -273.15, 1e4, 20),
    deltaT: numOr(p.deltaT, -1000, 1000, d.deltaT),
    compare: boolOr(p.compare, false),
  };
}

export interface EnergyProfile {
  /** ΔH = products − reactants, kJ (< 0 exothermic). */
  deltaH: number;
  /** Top of the hump, kJ: reactants + activation (never below either level). */
  peak: number;
  /** Ea as drawn (= activation unless the peak had to be raised to the products), kJ. */
  activation: number;
}

export function energyProfile(p: Pick<EnergyProfileParams, 'reactants' | 'products' | 'activation'>): EnergyProfile {
  const peak = Math.max(p.reactants + p.activation, p.products, p.reactants);
  return { deltaH: p.products - p.reactants, peak, activation: peak - p.reactants };
}

/** Plateau at the reactants (x < 0.2), smooth rise to the peak at 0.5, fall to the products (x > 0.8). */
export function humpEnergy(p: Pick<EnergyProfileParams, 'reactants' | 'products' | 'activation'>, x: number): number {
  const { peak } = energyProfile(p);
  if (x <= 0.5) return p.reactants + (peak - p.reactants) * smooth((x - 0.2) / 0.3);
  return p.products + (peak - p.products) * (1 - smooth((x - 0.5) / 0.3));
}

/** Seconds the reaction runs (temperature moves by ΔT), the relaxation time constant and the whole record. */
export const REACT = 10;
export const TAU = 40;
export const RECORD = 120;

/** T(t) = T₀ + ΔT·smooth(t/REACT) while reacting, then T₀ + ΔT·e^(−(t − REACT)/τ): back to room temperature. */
export function temperatureAt(p: Pick<EnergyProfileParams, 'startTemp' | 'deltaT'>, t: number): number {
  if (t <= REACT) return p.startTemp + p.deltaT * smooth(t / REACT);
  return p.startTemp + p.deltaT * Math.exp(-(t - REACT) / TAU);
}

const TITLE: Record<ReactionKind, ReturnType<typeof L>> = {
  exo: L('Экзотермиялык реакция', 'Экзотермическая реакция', 'Exothermic reaction'),
  endo: L('Эндотермиялык реакция', 'Эндотермическая реакция', 'Endothermic reaction'),
};
const T_REACTANTS = L('Реагенттер', 'Реагенты', 'Reactants');
const T_PRODUCTS = L('Продуктылар', 'Продукты', 'Products');
const T_PROGRESS = L('реакциянын жүрүшү', 'ход реакции', 'reaction progress');

const PLAY = 12;
const PAUSE = 2;
const W = 3.4;
const H = 2.4;

export const energyProfileModel: SimModel = {
  id: 'energy-profile',
  modes: [MODE.graph(true), MODE.temperature(), MODE.compare(), LABELS],
  clock(_raw, pb, free) {
    if (pb) return pb.fraction * RECORD;
    return (Math.min(free % (PLAY + PAUSE), PLAY) / PLAY) * RECORD;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parseEnergyProfileParams(raw);
    const graph = on(modes, 'graph');
    const temp = on(modes, 'temperature');
    const labels = on(modes, 'labels');
    const columns: { p: EnergyProfileParams; sfx: string }[] = [{ p, sfx: '' }];
    // The `compare` param or the `compare` mode (a tour step can toggle it) shows both kinds.
    if (p.compare || on(modes, 'compare')) {
      const other: ReactionKind = p.kind === 'exo' ? 'endo' : 'exo';
      const d = kindDefaults(other);
      columns.push({ p: { ...p, kind: other, products: d.products, deltaT: d.deltaT }, sfx: other === 'exo' ? '_Exo' : '_Endo' });
    }
    const colW = (graph ? W + 0.9 : 0) + (temp ? 3.3 : 0) || 1;
    const parts: Part[] = [];
    columns.forEach((c, i) => {
      const x0 = columns.length === 1 ? -colW / 2 : i === 0 ? -colW - 0.4 : 0.4;
      const G = `Column${c.sfx}`;
      parts.push({ name: G, shape: { kind: 'group' }, position: [x0, 0, 0], noPick: true });
      parts.push(text(`Title${c.sfx}`, tr(TITLE[c.p.kind], lang), [colW / 2, H + 0.75, 0], 0.17, { parent: G, bold: true, color: c.p.kind === 'exo' ? '#ffb4a2' : '#a2d2ff' }));
      if (graph) parts.push(...diagram(c.p, c.sfx, G, labels, lang));
      if (temp) parts.push(...temperature(c.p, c.sfx, G, graph ? W + 0.9 : 0, labels, lang));
    });
    return parts;
  },
};

function diagram(p: EnergyProfileParams, sfx: string, parent: string, labels: boolean, lang: Lang): Part[] {
  const N = (s: string) => `${s}${sfx}`;
  const ep = energyProfile(p);
  const eMax = Math.max(p.reactants, p.products, ep.peak) * 1.12 || 1;
  const Y = (e: number) => (e / eMax) * H;
  const X = (x: number) => x * W;
  const yR = Y(p.reactants);
  const yP = Y(p.products);
  const yPeak = Y(ep.peak);
  const curve = '#ffd166';
  const parts: Part[] = [
    { name: N('Diagram'), parent, shape: { kind: 'group' }, position: [0.5, 0, 0], noPick: true },
    { name: N('Diagram_Panel'), parent: N('Diagram'), shape: { kind: 'box', size: [W + 0.8, H + 0.8, 0.04], bevel: 0.02 }, position: [W / 2 - 0.05, H / 2 + 0.05, -0.06], color: '#14202c', opacity: 0.82, container: true, noPick: true },
    { name: N('Axis_Energy'), parent: N('Diagram'), shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, H + 0.25, 0], radius: 0.016 }, color: COLORS.axis, material: 'plastic' },
    { name: N('Axis_Progress'), parent: N('Diagram'), shape: { kind: 'arrow', from: [0, 0, 0], vector: [W + 0.25, 0, 0], radius: 0.016 }, color: COLORS.axis, material: 'plastic' },
    text(N('Axis_Energy_Title'), `E, ${unit('kJ', lang)}`, [0.05, H + 0.4, 0], 0.14, { parent: N('Diagram'), plate: false, billboard: false, bold: true, align: 'left' }),
    text(N('Axis_Progress_Title'), tr(T_PROGRESS, lang), [W, -0.2, 0], 0.13, { parent: N('Diagram'), plate: false, billboard: false, align: 'right' }),
    { name: N('Level_Reactants'), parent: N('Diagram'), shape: { kind: 'box', size: [X(0.22), 0.05, 0.06], bevel: 0.01 }, position: [X(0.11), yR, 0], color: '#4cc9f0', material: 'plastic' },
    { name: N('Level_Products'), parent: N('Diagram'), shape: { kind: 'box', size: [X(0.22), 0.05, 0.06], bevel: 0.01 }, position: [X(0.89), yP, 0], color: '#06d6a0', material: 'plastic' },
  ];
  // The hump runs from 0.04 to 0.96 of the width, flat over the level bars.
  const pts = Array.from({ length: 61 }, (_, i) => {
    const x = 0.04 + (0.92 * i) / 60;
    return [X(x), Y(humpEnergy(p, x)), 0.01] as [number, number, number];
  });
  parts.push({ name: N('Hump'), parent: N('Diagram'), shape: { kind: 'polyline', points: pts, radius: 0.022 }, color: curve, material: 'emissive', glow: 1 });
  // The reaction's state travels along the curve while it runs.
  parts.push({
    name: N('Hump_Point'), parent: N('Diagram'), shape: { kind: 'sphere', radius: 0.055, widthSegments: 18 }, color: '#ff6b6b', material: 'emissive', glow: 1.1, halo: { color: '#ff8787', size: 0.3, strength: 0.5 },
    motion: (t) => {
      const x = 0.04 + 0.92 * clamp(t / REACT, 0, 1);
      return { position: [X(x), Y(humpEnergy(p, x)), 0.03] };
    },
  });
  // Ea: from the reactant level up to the peak; dashed guide at the reactant level.
  const dash = (name: string, x0: number, x1: number, y: number) => {
    const n = Math.max(1, Math.floor((x1 - x0) / 0.12));
    for (let i = 0; i < n; i++) {
      const a = x0 + ((x1 - x0) * i) / n;
      parts.push({ name: `${name}_${i + 1}`, parent: N('Diagram'), shape: { kind: 'box', size: [((x1 - x0) / n) * 0.55, 0.01, 0.01] }, position: [a + ((x1 - x0) / n) * 0.3, y, 0], color: COLORS.axis, opacity: 0.7, container: true, noPick: true });
    }
  };
  dash(N('Guide_Reactants'), X(0.23), X(0.84), yR);
  if (ep.activation > 1e-9) {
    parts.push({ name: N('Arrow_Activation'), parent: N('Diagram'), shape: { kind: 'arrow', from: [X(0.5), yR, 0.02], vector: [0, yPeak - yR, 0], radius: 0.022 }, color: '#f15bb5', material: 'plastic', glow: 0.18 });
  } else {
    parts.push({ name: N('Arrow_Activation'), parent: N('Diagram'), shape: { kind: 'group' }, position: [X(0.5), yR, 0] });
  }
  if (Math.abs(ep.deltaH) > 1e-9) {
    parts.push({ name: N('Arrow_DeltaH'), parent: N('Diagram'), shape: { kind: 'arrow', from: [X(0.84), yR, 0.02], vector: [0, yP - yR, 0], radius: 0.026 }, color: ep.deltaH < 0 ? '#ff7b54' : '#5aa9ff', material: 'plastic', glow: 0.18 });
  } else {
    parts.push({ name: N('Arrow_DeltaH'), parent: N('Diagram'), shape: { kind: 'group' }, position: [X(0.84), yR, 0] });
  }
  if (labels) {
    parts.push(text(N('Level_Reactants_Label'), `${tr(T_REACTANTS, lang)}\n${qty(p.reactants, 'kJ', lang, 0)}`, [X(0.11), yR + 0.26, 0.05], 0.11, { parent: N('Diagram') }));
    parts.push(text(N('Level_Products_Label'), `${tr(T_PRODUCTS, lang)}\n${qty(p.products, 'kJ', lang, 0)}`, [X(0.89), yP + (yP < yR ? -0.3 : 0.26), 0.05], 0.11, { parent: N('Diagram') }));
    parts.push(text(N('Arrow_Activation_Label'), `Ea = ${qty(ep.activation, 'kJ', lang, 0)}`, [X(0.5) - 0.12, (yR + yPeak) / 2, 0.05], 0.12, { parent: N('Diagram'), color: '#f15bb5', align: 'right' }));
    const sign = ep.deltaH > 0 ? '+' : ep.deltaH < 0 ? '−' : '';
    parts.push(text(N('Arrow_DeltaH_Label'), `ΔH = ${sign}${fmt(Math.abs(ep.deltaH), 0, lang)} ${unit('kJ', lang)}`, [X(0.84) + 0.1, (yR + yP) / 2, 0.05], 0.12, { parent: N('Diagram'), color: ep.deltaH < 0 ? '#ff7b54' : '#5aa9ff', align: 'left' }));
  }
  return parts;
}

function temperature(p: EnergyProfileParams, sfx: string, parent: string, x0: number, labels: boolean, lang: Lang): Part[] {
  const N = (s: string) => `${s}${sfx}`;
  const T = (t: number) => temperatureAt(p, t);
  const tLo = Math.min(p.startTemp, p.startTemp + p.deltaT);
  const tHi = Math.max(p.startTemp, p.startTemp + p.deltaT);
  const lo = tLo - 10;
  const hi = tHi + 10;
  const bx = x0 + 0.55;
  const thH = 1.9;
  const colBase = 0.25;
  const parts: Part[] = [
    ...beaker(N('Beaker'), [bx, 0, 0], 0.42, 0.95, { parent, container: true }),
    liquid(N('Beaker_Liquid'), [bx, 0.03, 0], 0.39, 0.62, p.deltaT >= 0 ? '#ffc9a8' : '#bfe3ff', undefined, { parent }),
    // Thermometer standing in the liquid; the red column follows T(t).
    { name: N('Thermometer'), parent, shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: thH, segments: 20 }, position: [bx + 0.12, 0.15 + thH / 2, 0.05], color: COLORS.glass, material: 'glass' },
    { name: N('Thermometer_Bulb'), parent: N('Thermometer'), shape: { kind: 'sphere', radius: 0.06, widthSegments: 18 }, position: [0, -thH / 2, 0], color: '#e63946', material: 'plastic' },
    {
      name: N('Thermometer_Column'), parent: N('Thermometer'), shape: { kind: 'cylinder', radiusTop: 0.016, radiusBottom: 0.016, height: 1, segments: 10 }, color: '#e63946', material: 'emissive', glow: 1,
      motion: (t) => {
        const h = colBase + (thH - colBase - 0.15) * clamp((T(t) - lo) / (hi - lo), 0, 1);
        return { scale: [1, h, 1], position: [0, -thH / 2 + h / 2, 0] };
      },
    },
  ];
  for (let i = 0; i <= 8; i++) parts.push({ name: N(`Thermometer_Tick_${i}`), parent: N('Thermometer'), shape: { kind: 'box', size: [0.05, 0.006, 0.005] }, position: [0.035, -thH / 2 + colBase + ((thH - colBase - 0.15) * i) / 8, 0.03], color: '#343a40', noPick: true });
  // T(t) graph beside the beaker, drawn as the record runs.
  const gx = x0 + 1.25;
  const gw = 1.85;
  const gh = 1.5;
  const gy = 0.6;
  const GX = (t: number) => (t / RECORD) * gw;
  const GY = (c: number) => ((c - lo) / (hi - lo)) * gh;
  const GT = N('Graph_Temperature');
  parts.push({ name: GT, parent, shape: { kind: 'group' }, position: [gx, gy, 0] });
  parts.push({ name: `${GT}_Panel`, parent: GT, shape: { kind: 'box', size: [gw + 0.6, gh + 0.65, 0.04], bevel: 0.02 }, position: [gw / 2 - 0.05, gh / 2 + 0.05, -0.06], color: '#14202c', opacity: 0.82, container: true, noPick: true });
  parts.push({ name: `${GT}_Axis_T`, parent: GT, shape: { kind: 'arrow', from: [0, 0, 0], vector: [gw + 0.15, 0, 0], radius: 0.011 }, color: COLORS.axis });
  parts.push({ name: `${GT}_Axis_C`, parent: GT, shape: { kind: 'arrow', from: [0, 0, 0], vector: [0, gh + 0.15, 0], radius: 0.011 }, color: COLORS.axis });
  const room = GY(p.startTemp);
  parts.push({ name: `${GT}_Room`, parent: GT, shape: { kind: 'box', size: [gw, 0.008, 0.006] }, position: [gw / 2, room, 0], color: COLORS.axis, opacity: 0.45, container: true, noPick: true });
  const tSym = lang === 'en' ? 'T' : 't';
  const timeSym = lang === 'en' ? 't' : 'τ';
  parts.push(text(`${GT}_Title_C`, `${tSym}, ${unit('°C', lang)}`, [0, gh + 0.32, 0], 0.11, { parent: GT, plate: false, billboard: false, bold: true }));
  parts.push(text(`${GT}_Title_T`, `${timeSym}, ${unit('s', lang)}`, [gw + 0.12, -0.15, 0], 0.11, { parent: GT, plate: false, billboard: false, bold: true }));
  parts.push(text(`${GT}_Room_Label`, fmt(p.startTemp, 0, lang), [-0.08, room, 0], 0.1, { parent: GT, plate: false, billboard: false, align: 'right' }));
  if (Math.abs(p.deltaT) > 1e-9) parts.push(text(`${GT}_Peak_Label`, fmt(p.startTemp + p.deltaT, 0, lang), [-0.08, GY(p.startTemp + p.deltaT), 0], 0.1, { parent: GT, plate: false, billboard: false, align: 'right' }));
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t0 = (RECORD * i) / n;
    const t1 = (RECORD * (i + 1)) / n;
    parts.push(...growingSegment(`${GT}_Line_${i + 1}`, GT, [GX(t0), GY(T(t0)), 0.01], [GX(t1), GY(T(t1)), 0.01], 0.016, p.deltaT >= 0 ? '#ff7b54' : '#5aa9ff', (t) => (t - t0) / (t1 - t0)));
  }
  parts.push({ name: `${GT}_Point`, parent: GT, shape: { kind: 'sphere', radius: 0.04, widthSegments: 16 }, color: '#ffffff', material: 'emissive', glow: 1, motion: (t) => ({ position: [GX(clamp(t, 0, RECORD)), GY(T(t)), 0.03] }) });
  if (labels) {
    const sign = p.deltaT > 0 ? '+' : p.deltaT < 0 ? '−' : '';
    parts.push(text(N('Thermometer_Label'), `Δ${tSym} = ${sign}${fmt(Math.abs(p.deltaT), 1, lang)} ${unit('°C', lang)}`, [bx, 2.35, 0], 0.12, { parent }));
  }
  return parts;
}
