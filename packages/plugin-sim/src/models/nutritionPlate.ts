/**
 * `nutrition-plate` (1.1 nutrients, 1.2 balanced diet, 1.3 habits): foods on a
 * plate split into sectors by food group, energy bars per group with the
 * target split, a kcal gauge, and virtual food tests (iodine, biuret, paper).
 */
import type { Lang, Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, L, LABELS, MODE, clamp, fmt, idOr, listOf, numOr, obj, on, qty, text, tr, uniqueBy, unit, type SimModel } from './common.js';

export const GROUPS = ['carbs', 'proteins', 'fats', 'vitamins', 'minerals', 'water', 'fibre'] as const;
export type FoodGroup = (typeof GROUPS)[number];
export const TESTS = ['iodine', 'biuret', 'paper'] as const;
export type FoodTest = (typeof TESTS)[number];

export interface Food {
  id: string;
  group: FoodGroup;
  grams: number;
  /** Energy of this portion, kcal (estimated from the group when absent). */
  kcal?: number;
}
export interface DietTarget {
  kcal: number;
  /** % of energy */
  carbs: number;
  proteins: number;
  fats: number;
}
export interface NutritionParams {
  foods: Food[];
  target?: DietTarget;
  test?: FoodTest;
}

export const DEFAULT_FOODS: Food[] = [
  { id: 'rice', group: 'carbs', grams: 150 },
  { id: 'chicken', group: 'proteins', grams: 100 },
  { id: 'salad', group: 'vitamins', grams: 120 },
  { id: 'butter', group: 'fats', grams: 10 },
  { id: 'water', group: 'water', grams: 200 },
];

export function parseNutritionParams(raw: unknown): NutritionParams {
  const p = obj(raw);
  const foods = uniqueBy(
    listOf(p.foods, (x): Food | null => {
      const o = obj(x);
      const id = idOr(o.id);
      const grams = numOr(o.grams, 0, 1e5, NaN);
      if (!id || !(GROUPS as readonly unknown[]).includes(o.group) || !Number.isFinite(grams)) return null;
      const kcal = numOr(o.kcal, 0, 1e6, NaN);
      return { id, group: o.group as FoodGroup, grams, ...(Number.isFinite(kcal) ? { kcal } : {}) };
    }),
    (f) => f.id,
  );
  const t = obj(p.target);
  const kcal = numOr(t.kcal, 1, 1e5, NaN);
  const target = Number.isFinite(kcal) ? { kcal, carbs: numOr(t.carbs, 0, 100, 55), proteins: numOr(t.proteins, 0, 100, 15), fats: numOr(t.fats, 0, 100, 30) } : undefined;
  return { foods: foods.length ? foods : DEFAULT_FOODS, target, test: TESTS.includes(p.test as FoodTest) ? (p.test as FoodTest) : undefined };
}

/** Typical energy density of a food of each group, kcal per gram (used when `kcal` is absent). */
export const KCAL_PER_GRAM: Record<FoodGroup, number> = { carbs: 1.6, proteins: 1.8, fats: 8, vitamins: 0.4, minerals: 0, water: 0, fibre: 0.6 };
export const foodKcal = (f: Food) => f.kcal ?? f.grams * KCAL_PER_GRAM[f.group];
/** Which macronutrient a group's energy counts as (fruit, vegetables and fibre are carbohydrate foods). */
const MACRO: Record<FoodGroup, 'carbs' | 'proteins' | 'fats' | null> = { carbs: 'carbs', vitamins: 'carbs', fibre: 'carbs', proteins: 'proteins', fats: 'fats', minerals: null, water: null };

export interface NutritionSummary {
  totalKcal: number;
  totalGrams: number;
  byGroup: Record<FoodGroup, { grams: number; kcal: number }>;
  /** Share of the energy from carbohydrate, protein and fat foods, %. */
  shares: { carbs: number; proteins: number; fats: number };
  /** Target energy per macronutrient, kcal (target.kcal × %). */
  targetKcal?: { carbs: number; proteins: number; fats: number };
}

export function nutritionSummary(p: NutritionParams): NutritionSummary {
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, { grams: 0, kcal: 0 }])) as NutritionSummary['byGroup'];
  const macro = { carbs: 0, proteins: 0, fats: 0 };
  for (const f of p.foods) {
    const k = foodKcal(f);
    byGroup[f.group].grams += f.grams;
    byGroup[f.group].kcal += k;
    const m = MACRO[f.group];
    if (m) macro[m] += k;
  }
  const totalKcal = p.foods.reduce((n, f) => n + foodKcal(f), 0);
  const totalGrams = p.foods.reduce((n, f) => n + f.grams, 0);
  const pct = (x: number) => (totalKcal > 0 ? (100 * x) / totalKcal : 0);
  return {
    totalKcal,
    totalGrams,
    byGroup,
    shares: { carbs: pct(macro.carbs), proteins: pct(macro.proteins), fats: pct(macro.fats) },
    targetKcal: p.target ? { carbs: (p.target.kcal * p.target.carbs) / 100, proteins: (p.target.kcal * p.target.proteins) / 100, fats: (p.target.kcal * p.target.fats) / 100 } : undefined,
  };
}

/** Food test result: iodine turns blue-black on starch, biuret violet on protein, a fat leaves a translucent spot on paper. */
export function testResult(group: FoodGroup, test: FoodTest): { positive: boolean; color: string } {
  switch (test) {
    case 'iodine':
      return group === 'carbs' ? { positive: true, color: '#1b1f3b' } : { positive: false, color: '#c86b1a' };
    case 'biuret':
      return group === 'proteins' ? { positive: true, color: '#7b2cbf' } : { positive: false, color: '#4361ee' };
    default:
      return group === 'fats' ? { positive: true, color: '#fff3b0' } : { positive: false, color: '#f1f3f5' };
  }
}

export const GROUP_COLOR: Record<FoodGroup, string> = {
  carbs: '#f4a261', proteins: '#e5383b', fats: '#ffd166', vitamins: '#80b918', minerals: '#adb5bd', water: '#48cae4', fibre: '#6a4c93',
};
const GROUP_TITLE: Record<FoodGroup, ReturnType<typeof L>> = {
  carbs: L('Углеводдор', 'Углеводы', 'Carbohydrates'),
  proteins: L('Белоктор', 'Белки', 'Proteins'),
  fats: L('Майлар', 'Жиры', 'Fats'),
  vitamins: L('Витаминдер', 'Витамины', 'Vitamins'),
  minerals: L('Минералдар', 'Минералы', 'Minerals'),
  water: L('Суу', 'Вода', 'Water'),
  fibre: L('Була', 'Клетчатка', 'Fibre'),
};

const SURFACE = 0.07;

export const nutritionPlate: SimModel = {
  id: 'nutrition-plate',
  modes: [MODE.groups(true), MODE.energy(false), LABELS],
  usesSelection: true,
  clock: (_raw, pb, free) => (pb ? pb.time : free),
  build(raw, { modes, lang = 'ru', selected }) {
    const p = parseNutritionParams(raw);
    const sum = nutritionSummary(p);
    const labels = on(modes, 'labels');
    const parts: Part[] = [
      { name: 'Table', shape: { kind: 'box', size: [7.4, 0.06, 4.4], bevel: 0.02 }, position: [0.4, -0.03, -0.8], color: '#e8d2b0', material: 'wood', textureScale: 1.2, noPick: true },
      // Porcelain plate with a raised rim (lathe with a wall).
      { name: 'Plate', shape: { kind: 'lathe', segments: 64, profile: [[0, 0], [0.9, 0], [0.95, 0.02], [1.02, 0.05], [1.3, 0.11], [1.34, 0.12], [1.3, 0.13], [1.0, 0.075], [0, 0.06]] }, color: '#f8f9fa', material: 'plastic' },
    ];
    const onPlate = p.foods.filter((f) => f.group !== 'water');
    const drinks = p.foods.filter((f) => f.group === 'water');
    // Sectors by mass share of each group on the plate.
    const plateGrams = onPlate.reduce((n, f) => n + f.grams, 0) || 1;
    const groups = GROUPS.filter((g) => g !== 'water' && onPlate.some((f) => f.group === g));
    let a0 = Math.PI / 2;
    const span = new Map<FoodGroup, [number, number]>();
    for (const g of groups) {
      const share = sum.byGroup[g].grams / plateGrams;
      const a1 = a0 - Math.max(share, 0.04) * Math.PI * 2 * (1 / groups.reduce((n, x) => n + Math.max(sum.byGroup[x].grams / plateGrams, 0.04), 0));
      span.set(g, [a1, a0]);
      a0 = a1;
    }
    if (on(modes, 'groups')) {
      for (const g of groups) {
        const [s0, s1] = span.get(g)!;
        const pts: Vec3[] = [[0, SURFACE + 0.004, 0]];
        const n = Math.max(3, Math.ceil(((s1 - s0) / (Math.PI * 2)) * 64));
        for (let i = 0; i <= n; i++) {
          const a = s0 + ((s1 - s0) * i) / n;
          pts.push([Math.cos(a) * 0.98, SURFACE + 0.004, -Math.sin(a) * 0.98]);
        }
        parts.push({ name: `Sector_${g}`, shape: { kind: 'polygon', points: pts }, color: GROUP_COLOR[g], opacity: 0.55, container: true });
        if (labels) {
          const m = (s0 + s1) / 2;
          parts.push(text(`Sector_${g}_Label`, `${fmt((100 * sum.byGroup[g].grams) / plateGrams, 0, lang)} %`, [Math.cos(m) * 1.12, SURFACE + 0.02, -Math.sin(m) * 1.12], 0.1, { color: GROUP_COLOR[g] }));
        }
      }
      if (drinks.length) parts.push({ name: 'Sector_water', shape: { kind: 'cylinder', radiusTop: 0.34, radiusBottom: 0.34, height: 0.012, segments: 40 }, position: [1.75, 0.006, 0.55], color: GROUP_COLOR.water, opacity: 0.6, container: true });
    }
    // Foods: shapes by group, several foods of a group spread along its sector.
    for (const g of groups) {
      const list = onPlate.filter((f) => f.group === g);
      const [s0, s1] = span.get(g)!;
      list.forEach((f, i) => {
        const a = s0 + ((s1 - s0) * (i + 0.5)) / list.length;
        const r = list.length > 2 ? 0.55 + 0.25 * (i % 2) : 0.62;
        parts.push(...foodPart(f, [Math.cos(a) * r, SURFACE, -Math.sin(a) * r]));
      });
    }
    drinks.forEach((f, i) => parts.push(...foodPart(f, [1.75 + i * 0.75, 0, 0.55])));
    if (labels) {
      for (const f of p.foods) {
        const at = foodAt(parts, f.id);
        if (at) parts.push(text(`Food_${f.id}_Label`, `${qty(f.grams, 'g', lang, 0)} · ${qty(foodKcal(f), 'kcal', lang, 0)}`, [at[0], at[1] + 0.38, at[2]], 0.085));
      }
    }
    if (on(modes, 'energy')) parts.push(...energyParts(p, sum, labels, lang));
    if (p.test) {
      // The test runs on the selected food; with no food selected, on every food.
      const picked = p.foods.filter((f) => selected?.has(`Food_${f.id}`));
      const tested = picked.length ? picked : p.foods;
      parts.push({ name: 'Reagent', shape: { kind: 'lathe', segments: 28, profile: [[0, 0], [0.12, 0], [0.13, 0.24], [0.05, 0.3], [0.04, 0.38], [0.02, 0.44], [0, 0.45]] }, position: [-1.75, 0, 0.6], color: p.test === 'iodine' ? '#8a4b16' : p.test === 'biuret' ? '#3a56d4' : '#f1f3f5', material: 'glass' });
      if (p.test === 'paper') parts.push({ name: 'Reagent_Paper', parent: 'Reagent', shape: { kind: 'box', size: [0.3, 0.004, 0.3] }, position: [0, 0.002, 0.45], color: '#fbf6e9', material: 'matte' });
      for (const f of tested) {
        const at = foodAt(parts, f.id);
        if (!at) continue;
        const res = testResult(f.group, p.test);
        if (p.test === 'paper') {
          parts.push({ name: `Test_${f.id}`, shape: { kind: 'box', size: [0.24, 0.006, 0.24] }, position: [at[0] + 0.22, at[1] + 0.32, at[2] + 0.1], rotation: [-0.5, 0, 0], color: '#fbf6e9', material: 'matte' });
          if (res.positive) parts.push({ name: `Test_${f.id}_Spot`, parent: `Test_${f.id}`, shape: { kind: 'cylinder', radiusTop: 0.07, radiusBottom: 0.07, height: 0.008, segments: 24 }, color: res.color, opacity: 0.55, container: true, glow: 0.3 });
        } else {
          parts.push({ name: `Test_${f.id}`, shape: { kind: 'sphere', radius: 0.07, widthSegments: 18 }, position: [at[0], at[1] + 0.2, at[2]], scale: [1, 0.45, 1], color: res.color, material: 'glass', glow: 0.25 });
        }
        if (labels) parts.push(text(`Test_${f.id}_Label`, res.positive ? '+' : '−', [at[0] + 0.2, at[1] + 0.2, at[2]], 0.11, { bold: true, color: res.positive ? '#80ffdb' : '#ff8fa3' }));
      }
    }
    return parts;
  },
};

/** Top centre of a food (its group part's position plus its height), for labels and tests. */
function foodAt(parts: Part[], id: string): Vec3 | null {
  const p = parts.find((x) => x.name === `Food_${id}`);
  return p?.position ? [p.position[0], p.position[1] + 0.1, p.position[2]] : null;
}

function foodPart(f: Food, at: Vec3): Part[] {
  const N = `Food_${f.id}`;
  const s = clamp(0.2 * Math.cbrt(Math.max(f.grams, 1) / 100), 0.08, 0.42);
  const parts: Part[] = [{ name: N, shape: { kind: 'group' }, position: at }];
  switch (f.group) {
    case 'carbs':
      parts.push({ name: `${N}_Body`, parent: N, shape: { kind: 'sphere', radius: s * 1.3, widthSegments: 32, hemisphere: true }, scale: [1, 0.55, 1], color: '#f3e6c8', material: 'matte' });
      break;
    case 'proteins':
      parts.push({ name: `${N}_Body`, parent: N, shape: { kind: 'box', size: [s * 2, s * 0.6, s * 1.3], bevel: s * 0.25 }, position: [0, s * 0.3, 0], rotation: [0, 0.4, 0], color: '#b5653f', material: 'plastic', roughness: 0.6 });
      break;
    case 'fats':
      parts.push({ name: `${N}_Body`, parent: N, shape: { kind: 'box', size: [s * 1.1, s * 0.8, s * 1.1], bevel: s * 0.08 }, position: [0, s * 0.4, 0], rotation: [0, 0.3, 0], color: '#ffe8a3', material: 'plastic' });
      break;
    case 'vitamins':
      ([['#e63946', -0.5, 0], ['#f77f00', 0.5, 0.1], ['#80b918', 0, -0.6]] as const).forEach(([c, dx, dz], i) =>
        parts.push({ name: `${N}_Body_${i + 1}`, parent: N, shape: { kind: 'sphere', radius: s * 0.55, widthSegments: 24 }, position: [dx * s, s * 0.55, dz * s], color: c, material: 'plastic' }),
      );
      break;
    case 'fibre':
      [0, 1, 2, 3].forEach((i) =>
        parts.push({ name: `${N}_Body_${i + 1}`, parent: N, shape: { kind: 'sphere', radius: s * 0.6, widthSegments: 20 }, position: [Math.cos(i * 1.6) * s * 0.5, s * 0.15 + i * 0.01, Math.sin(i * 1.6) * s * 0.5], rotation: [0.3, i * 1.6, 0], scale: [1, 0.25, 0.55], color: i % 2 ? '#2d6a4f' : '#40916c', material: 'matte' }),
      );
      break;
    case 'minerals':
      [0, 1, 2, 3, 4].forEach((i) =>
        parts.push({ name: `${N}_Body_${i + 1}`, parent: N, shape: { kind: 'icosahedron', radius: s * 0.3, detail: 0 }, position: [Math.cos(i * 1.3) * s * 0.4, s * 0.25, Math.sin(i * 1.3) * s * 0.4], rotation: [i, i * 0.7, 0], color: '#e9ecef', material: 'glass' }),
      );
      break;
    case 'water': {
      const h = clamp(0.5 * Math.cbrt(Math.max(f.grams, 1) / 200), 0.25, 0.8);
      parts.push({ name: `${N}_Glass`, parent: N, shape: { kind: 'cylinder', radiusTop: 0.26, radiusBottom: 0.22, height: h, segments: 40, openEnded: true }, position: [0, h / 2 + 0.012, 0], color: COLORS.glass, material: 'glass', container: true });
      parts.push({ name: `${N}_Water`, parent: N, shape: { kind: 'cylinder', radiusTop: 0.24, radiusBottom: 0.21, height: h * 0.8, segments: 40 }, position: [0, h * 0.4 + 0.015, 0], color: '#7cc4ee', opacity: 0.55, container: true });
      break;
    }
  }
  return parts;
}

function energyParts(p: NutritionParams, sum: NutritionSummary, labels: boolean, lang: Lang): Part[] {
  const groups = GROUPS.filter((g) => p.foods.some((f) => f.group === g));
  const tk = sum.targetKcal;
  const macroTarget = (g: FoodGroup) => (tk && (g === 'carbs' || g === 'proteins' || g === 'fats') ? tk[g] : 0);
  const top = Math.max(1, ...groups.map((g) => Math.max(sum.byGroup[g].kcal, macroTarget(g))));
  const H = 1.8;
  const z = -2.25;
  const w = 0.32;
  const x0 = -2.1;
  const parts: Part[] = [];
  groups.forEach((g, i) => {
    const x = x0 + i * 0.5;
    const h = Math.max(0.01, (sum.byGroup[g].kcal / top) * H);
    parts.push({ name: `Bar_${g}`, shape: { kind: 'box', size: [w, h, w], bevel: 0.02 }, position: [x, h / 2, z], color: GROUP_COLOR[g], material: 'plastic' });
    const t = macroTarget(g);
    if (t > 0) parts.push({ name: `Bar_${g}_Target`, parent: `Bar_${g}`, shape: { kind: 'torus', radius: w * 0.78, tube: 0.012, segments: 4 }, position: [0, (t / top) * H - h / 2, 0], rotation: [Math.PI / 2, 0, Math.PI / 4], color: '#ffffff', material: 'plastic', glow: 0.4 });
    if (labels) {
      parts.push(text(`Bar_${g}_Label`, `${fmt(sum.byGroup[g].kcal, 0, lang)}`, [x, h + 0.16, z], 0.11));
      parts.push(text(`Bar_${g}_Title`, tr(GROUP_TITLE[g], lang), [x, -0.12, z + 0.25], 0.09, { color: GROUP_COLOR[g] }));
    }
  });
  // Kcal gauge: a half dial from 0 to 1.25 × the larger of the total and the target, a green band around the target.
  const target = p.target?.kcal;
  const full = Math.max(sum.totalKcal, target ?? 2500) * 1.25 || 1;
  const gx = 2.35;
  const gy = 0.95;
  const R = 0.62;
  const ang = (k: number) => Math.PI - Math.PI * clamp(k / full, 0, 1);
  parts.push({ name: 'Scale', shape: { kind: 'group' }, position: [gx, gy, z] });
  parts.push({ name: 'Scale_Body', parent: 'Scale', shape: { kind: 'box', size: [1.6, 0.95, 0.08], bevel: 0.04 }, position: [0, 0.22, -0.05], color: '#2b2f3a', material: 'plastic' });
  parts.push({ name: 'Scale_Arc', parent: 'Scale', shape: { kind: 'torus', radius: R, tube: 0.02, arc: Math.PI, segments: 64 }, color: '#dee2e6', material: 'plastic' });
  if (target) {
    const a1 = ang(target * 1.1);
    const a0 = ang(target * 0.9);
    parts.push({ name: 'Scale_Target', parent: 'Scale', shape: { kind: 'torus', radius: R, tube: 0.045, arc: a0 - a1, segments: 24 }, rotation: [0, 0, a1], position: [0, 0, 0.01], color: '#06d6a0', material: 'emissive', glow: 0.8 });
  }
  const a = ang(sum.totalKcal);
  parts.push({ name: 'Scale_Needle', parent: 'Scale', shape: { kind: 'box', size: [R * 0.95, 0.03, 0.02] }, position: [Math.cos(a) * R * 0.475, Math.sin(a) * R * 0.475, 0.04], rotation: [0, 0, a], color: '#e63946', material: 'plastic' });
  parts.push({ name: 'Scale_Hub', parent: 'Scale', shape: { kind: 'cylinder', radiusTop: 0.05, radiusBottom: 0.05, height: 0.04, segments: 20 }, position: [0, 0, 0.05], rotation: [Math.PI / 2, 0, 0], color: '#dee2e6', material: 'metal' });
  const lines = [`${fmt(sum.totalKcal, 0, lang)} ${unit('kcal', lang)}`];
  if (target) lines.push(`/ ${fmt(target, 0, lang)}`);
  parts.push(text('Scale_Label', lines.join(' '), [0, -0.12, 0.06], 0.12, { parent: 'Scale', billboard: false, plate: false, bold: true }));
  if (labels && sum.targetKcal && p.target) {
    const s = sum.shares;
    parts.push(text('Scale_Shares', `${tr(GROUP_TITLE.carbs, lang)} ${fmt(s.carbs, 0, lang)} / ${fmt(p.target.carbs, 0, lang)} %\n${tr(GROUP_TITLE.proteins, lang)} ${fmt(s.proteins, 0, lang)} / ${fmt(p.target.proteins, 0, lang)} %\n${tr(GROUP_TITLE.fats, lang)} ${fmt(s.fats, 0, lang)} / ${fmt(p.target.fats, 0, lang)} %`, [0, 1.05, 0.06], 0.1, { parent: 'Scale' }));
  }
  return parts;
}
