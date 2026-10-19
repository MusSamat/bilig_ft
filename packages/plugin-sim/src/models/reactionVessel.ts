/**
 * `reaction-vessel` (6.1–6.4 metals): a metal in oxygen, water, steam or acid;
 * bubbles of hydrogen, a flame and colour changes follow the reactivity series
 * K > Na > Ca > Mg > Al > Zn > Fe > (H) > Cu > Ag > Au. `compare` puts other
 * metals side by side in the same reagent.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, L, LABELS, MODE, clamp, enumOr, obj, on, smooth, text, tr, type SimModel } from './common.js';

export const SERIES = ['K', 'Na', 'Ca', 'Mg', 'Al', 'Zn', 'Fe', 'Cu', 'Ag', 'Au'] as const;
export type Metal = (typeof SERIES)[number];
export const REAGENTS = ['oxygen', 'water', 'steam', 'acid'] as const;
export type Reagent = (typeof REAGENTS)[number];
/** Hydrogen sits between Fe and Cu: metals before this index displace it from acids. */
export const H_INDEX = 7;

export interface ReactionParams {
  metal: Metal;
  reagent: Reagent;
  compare: Metal[];
}
export const DEFAULT_REACTION: ReactionParams = { metal: 'Zn', reagent: 'acid', compare: [] };

export function parseReactionParams(raw: unknown): ReactionParams {
  const p = obj(raw);
  const metal = enumOr(p.metal, SERIES, DEFAULT_REACTION.metal);
  const compare = Array.isArray(p.compare)
    ? [...new Set(p.compare.filter((m): m is Metal => (SERIES as readonly unknown[]).includes(m)))].filter((m) => m !== metal).slice(0, 6)
    : [];
  return { metal, reagent: enumOr(p.reagent, REAGENTS, DEFAULT_REACTION.reagent), compare };
}

/** Position in the reactivity series (0 = most reactive). */
export const reactivityRank = (m: Metal) => SERIES.indexOf(m);

/**
 * Visible rate 0..1, non-increasing down the series for every reagent.
 * Water: only K, Na, Ca visibly (Mg slowly). Steam: also Mg, Al, Zn, Fe.
 * Acid: every metal above hydrogen. Oxygen: Cu only darkens; Ag and Au don't change.
 */
const RATES: Record<Reagent, readonly number[]> = {
  //         K     Na    Ca    Mg    Al    Zn    Fe    Cu    Ag  Au
  acid: [1, 0.95, 0.85, 0.7, 0.55, 0.4, 0.22, 0, 0, 0],
  water: [1, 0.8, 0.5, 0.06, 0, 0, 0, 0, 0, 0],
  steam: [1, 0.95, 0.85, 0.7, 0.45, 0.35, 0.2, 0, 0, 0],
  oxygen: [1, 0.9, 0.8, 0.75, 0.5, 0.4, 0.3, 0.15, 0, 0],
};
export const reactionRate = (m: Metal, r: Reagent) => RATES[r][reactivityRank(m)];

/** Gives hydrogen (bubbles): acid, water, steam. */
export const givesHydrogen = (m: Metal, r: Reagent) => r !== 'oxygen' && reactionRate(m, r) > 0;
/** Burns with a flame in oxygen (Cu only darkens). */
export const burns = (m: Metal, r: Reagent) => r === 'oxygen' && reactivityRank(m) < reactivityRank('Cu');
/** A base (alkali) forms in the water: phenolphthalein turns pink. */
export function formsBase(m: Metal, r: Reagent): boolean {
  if (r === 'water') return reactionRate(m, r) > 0;
  // Oxides of K, Na, Ca, Mg dissolve in the water at the bottom of the jar as alkalis.
  if (r === 'oxygen') return reactivityRank(m) <= reactivityRank('Mg');
  return false;
}

/** Flame colours (flame tests): K lilac, Na yellow, Ca brick red, Mg dazzling white; H₂ burns pale blue. */
const FLAME: Partial<Record<Metal, string>> = { K: '#c58cff', Na: '#ffb627', Ca: '#ff6a3d', Mg: '#ffffff', Al: '#fff4d6', Zn: '#bff5e1', Fe: '#ffb347' };
const METAL_COLOR: Record<Metal, string> = {
  K: '#c9ccd6', Na: '#d4d7dd', Ca: '#d8d8cf', Mg: '#e3e5e8', Al: '#d0d4da', Zn: '#a9b3bd', Fe: '#868c94', Cu: '#c87533', Ag: '#e6e8ec', Au: '#e6b84a',
};

const NO_REACTION = L('реакция жүрбөйт', 'реакция не идёт', 'no reaction');
/** Word equations as formulas (school level; K and Na with oxygen as the normal oxides). */
const EQUATIONS: Record<Reagent, Partial<Record<Metal, string>>> = {
  acid: {
    K: '2K + 2HCl → 2KCl + H₂↑', Na: '2Na + 2HCl → 2NaCl + H₂↑', Ca: 'Ca + 2HCl → CaCl₂ + H₂↑', Mg: 'Mg + 2HCl → MgCl₂ + H₂↑',
    Al: '2Al + 6HCl → 2AlCl₃ + 3H₂↑', Zn: 'Zn + 2HCl → ZnCl₂ + H₂↑', Fe: 'Fe + 2HCl → FeCl₂ + H₂↑',
  },
  water: { K: '2K + 2H₂O → 2KOH + H₂↑', Na: '2Na + 2H₂O → 2NaOH + H₂↑', Ca: 'Ca + 2H₂O → Ca(OH)₂ + H₂↑', Mg: 'Mg + 2H₂O → Mg(OH)₂ + H₂↑' },
  steam: {
    K: '2K + 2H₂O → 2KOH + H₂↑', Na: '2Na + 2H₂O → 2NaOH + H₂↑', Ca: 'Ca + 2H₂O → Ca(OH)₂ + H₂↑', Mg: 'Mg + H₂O → MgO + H₂↑',
    Al: '2Al + 3H₂O → Al₂O₃ + 3H₂↑', Zn: 'Zn + H₂O → ZnO + H₂↑', Fe: '3Fe + 4H₂O → Fe₃O₄ + 4H₂↑',
  },
  oxygen: {
    K: '4K + O₂ → 2K₂O', Na: '4Na + O₂ → 2Na₂O', Ca: '2Ca + O₂ → 2CaO', Mg: '2Mg + O₂ → 2MgO', Al: '4Al + 3O₂ → 2Al₂O₃',
    Zn: '2Zn + O₂ → 2ZnO', Fe: '3Fe + 2O₂ → Fe₃O₄', Cu: '2Cu + O₂ → 2CuO',
  },
};
export const equation = (m: Metal, r: Reagent, lang: 'ky' | 'ru' | 'en' = 'ru') => EQUATIONS[r][m] ?? `${m} + ${r === 'acid' ? 'HCl' : r === 'oxygen' ? 'O₂' : 'H₂O'}: ${tr(NO_REACTION, lang)}`;

/** Product colour: the salt solution / hydroxide / oxide. */
function productColor(m: Metal, r: Reagent): string {
  if (r === 'acid') return m === 'Fe' ? '#b9e39a' : '#eef6ff';
  if (r === 'water') return m === 'Ca' || m === 'Mg' ? '#f4f4f0' : '#eef6ff';
  if (m === 'Cu') return '#1d1d1f';
  if (m === 'Fe') return '#2a2a2e';
  return '#f6f6f2';
}

export const REACTION_RUN = 10;
const RUN = REACTION_RUN;
const PAUSE = 2;

export const reactionVessel: SimModel = {
  id: 'reaction-vessel',
  modes: [MODE.run(true), LABELS, MODE.indicator()],
  clock: (_raw, pb, free) => (pb ? pb.fraction * RUN : Math.min(free % (RUN + PAUSE), RUN)),
  build(raw, { modes, lang = 'ru' }) {
    const p = parseReactionParams(raw);
    const metals = [p.metal, ...p.compare];
    const run = on(modes, 'run');
    const u = (t: number) => (run ? clamp(t / RUN, 0, 1) : 0);
    const step = p.reagent === 'steam' ? 2.3 : 1.15;
    const parts: Part[] = [];
    if (p.reagent === 'acid' || p.reagent === 'water') {
      // Test-tube rack under the row of tubes.
      const w = metals.length * step + 0.3;
      parts.push({ name: 'Rack', shape: { kind: 'box', size: [w, 0.06, 0.5], bevel: 0.015 }, position: [0, 0.03, 0], color: '#c69c6d', material: 'wood', noPick: true });
      parts.push({ name: 'Rack_Top', parent: 'Rack', shape: { kind: 'box', size: [w, 0.05, 0.5], bevel: 0.015 }, position: [0, 0.75, 0], color: '#c69c6d', material: 'wood', noPick: true });
      [-1, 1].forEach((sx, i) => parts.push({ name: `Rack_Post_${i + 1}`, parent: 'Rack', shape: { kind: 'box', size: [0.06, 0.75, 0.06] }, position: [(sx * w) / 2 - sx * 0.05, 0.38, 0], color: '#a87f55', material: 'wood', noPick: true }));
    }
    metals.forEach((m, i) => {
      const x = (i - (metals.length - 1) / 2) * step;
      const sfx = i === 0 ? '' : `_${m}`;
      parts.push(...vessel(m, p.reagent, [x, 0, 0], sfx, i === 0, u, run, on(modes, 'indicator')));
      if (on(modes, 'labels')) {
        // Two lines (reactants → / products) so neighbouring tubes don't collide.
        parts.push(text(`Equation${sfx}`, equation(m, p.reagent, lang).replace(' → ', ' →\n').replace(': ', ':\n'), [x, p.reagent === 'steam' ? 1.8 : 2.1, 0], 0.11));
        parts.push(text(`Symbol${sfx}`, m, [x, -0.18, 0.3], 0.18, { bold: true }));
      }
    });
    return parts;
  },
};

/** Metal piece (shape by metal) centred at the origin of its group. */
function metalShape(m: Metal): Part['shape'] {
  switch (m) {
    case 'Mg':
    case 'Cu':
      return { kind: 'box', size: [0.035, 0.28, 0.012] };
    case 'Al':
      return { kind: 'box', size: [0.16, 0.12, 0.008] };
    case 'Zn':
      return { kind: 'icosahedron', radius: 0.065, detail: 0 };
    case 'Fe':
      return { kind: 'cylinder', radiusTop: 0.016, radiusBottom: 0.004, height: 0.32, segments: 12 };
    case 'Ag':
    case 'Au':
      return { kind: 'box', size: [0.11, 0.06, 0.03], bevel: 0.008 };
    default:
      return { kind: 'box', size: [0.12, 0.09, 0.09], bevel: 0.03 };
  }
}

function vessel(m: Metal, r: Reagent, at: Vec3, sfx: string, main: boolean, u: (t: number) => number, run: boolean, indicator: boolean): Part[] {
  const rate = reactionRate(m, r);
  const N = (s: string) => `${s}${sfx}`;
  const parts: Part[] = [];
  const glass = { color: COLORS.glass, material: 'glass', container: true } as const;
  const metalName = `Metal_${m}`;
  const metalParent = main ? 'Metal' : undefined;
  if (main) parts.push({ name: 'Metal', shape: { kind: 'group' } });
  const metalLook = { color: METAL_COLOR[m], material: m === 'Cu' || m === 'Au' ? ('copper' as const) : ('metal' as const) };
  // Reacting metal is used up (K and Na almost completely).
  const shrink = (t: number) => 1 - (m === 'K' || m === 'Na' ? 0.85 : 0.6) * rate * smooth(u(t));
  const active = (t: number) => run && rate > 0 && u(t) > 0.02 && shrink(t) > 0.16;
  const [x, , z] = at;
  for (const g of ['Bubbles', 'Flame', 'Product']) parts.push({ name: N(g), shape: { kind: 'group' }, position: [x, 0, z] });
  if (indicator) parts.push({ name: N('Indicator'), shape: { kind: 'group' }, position: [x, 0, z] });

  if (r === 'acid' || r === 'water') {
    // Test tube: open glass tube with a round bottom, liquid to `ly`.
    const tr0 = 0.17;
    const th = 1.45;
    const by = 0.12;
    const ly = by + 0.85;
    parts.push({ name: N('Vessel'), shape: { kind: 'cylinder', radiusTop: tr0, radiusBottom: tr0, height: th, segments: 40, openEnded: true }, position: [x, by + tr0 + th / 2, z], ...glass });
    parts.push({ name: N('Vessel_Bottom'), parent: N('Vessel'), shape: { kind: 'sphere', radius: tr0, widthSegments: 32, hemisphere: true }, position: [0, -th / 2, 0], rotation: [Math.PI, 0, 0], ...glass });
    parts.push({ name: N('Vessel_Lip'), parent: N('Vessel'), shape: { kind: 'torus', radius: tr0 + 0.01, tube: 0.012, segments: 40 }, position: [0, th / 2, 0], rotation: [Math.PI / 2, 0, 0], ...glass });
    const lh = ly - by;
    parts.push({ name: N('Liquid'), shape: { kind: 'cylinder', radiusTop: tr0 * 0.92, radiusBottom: tr0 * 0.92, height: lh - tr0 * 0.6, segments: 32 }, position: [x, by + tr0 * 0.6 + (lh - tr0 * 0.6) / 2, z], color: r === 'acid' ? '#e8f6ff' : '#a9d8f5', opacity: 0.45, container: true });
    parts.push({ name: N('Liquid_Bottom'), parent: N('Liquid'), shape: { kind: 'sphere', radius: tr0 * 0.92, widthSegments: 24, hemisphere: true }, position: [0, -(lh - tr0 * 0.6) / 2, 0], rotation: [Math.PI, 0, 0], color: r === 'acid' ? '#e8f6ff' : '#a9d8f5', opacity: 0.45, container: true });
    // K and Na float and dart about on the water; the rest lie on the bottom.
    const floats = r === 'water' && (m === 'K' || m === 'Na');
    const metalAt = (t: number): Vec3 => (floats ? [x + Math.sin(t * 3.1) * 0.07 * (run ? 1 : 0), ly - 0.03, z + Math.cos(t * 2.3) * 0.05 * (run ? 1 : 0)] : [x, by + 0.07, z]);
    parts.push({
      name: metalName, parent: metalParent, shape: metalShape(m), position: metalAt(0), rotation: m === 'Mg' || m === 'Cu' || m === 'Fe' ? [0, 0, 0.35] : [0, 0.5, 0], ...metalLook,
      motion: (t) => {
        const k = Math.max(0.05, shrink(t));
        return { position: metalAt(t), scale: [k, k, k] };
      },
    });
    if (rate > 0) {
      const n = Math.round(4 + 22 * rate);
      const speed = 0.35 + 1.2 * rate;
      for (let i = 0; i < n; i++) {
        parts.push({
          name: N(`Bubbles_${i + 1}`), parent: N('Bubbles'), shape: { kind: 'sphere', radius: 0.018 + 0.012 * ((i * 7) % 3) / 2, widthSegments: 10 }, color: '#ffffff', opacity: 0.55, container: true,
          motion: (t) => {
            const f = (t * speed * 0.6 + i / n) % 1;
            const y0 = floats ? ly - 0.06 : by + 0.1;
            const yy = floats ? y0 + f * 0.08 : y0 + f * (ly - y0 - 0.02);
            const ang = i * 2.4;
            return { position: [Math.cos(ang) * 0.07 * (0.4 + 0.6 * f), yy, Math.sin(ang) * 0.07 * (0.4 + 0.6 * f)], visible: active(t) };
          },
        });
      }
      // Dissolved product (salt / hydroxide) builds up from the metal.
      parts.push({
        name: N('Product_Solution'), parent: N('Product'), shape: { kind: 'cylinder', radiusTop: tr0 * 0.85, radiusBottom: tr0 * 0.85, height: 1, segments: 32 }, color: productColor(m, r), opacity: m === 'Ca' && r === 'water' ? 0.6 : 0.3, container: true,
        motion: (t) => {
          const k = Math.max(1e-3, smooth(u(t)) * (lh - 0.1));
          return { scale: [1, k, 1], position: [0, by + 0.05 + k / 2, 0], visible: run && u(t) > 0.02 };
        },
      });
    }
    if (r === 'water' && (m === 'K' || m === 'Na')) parts.push(flame(N('Flame_Fire'), N('Flame'), [0, ly + 0.08, 0], FLAME[m]!, m === 'K' ? 1 : 0.55, (t) => ({ position: [metalAt(t)[0] - x, ly + 0.08, metalAt(t)[2] - z] }), active));
    if (r === 'acid' && m === 'K') parts.push(flame(N('Flame_Fire'), N('Flame'), [0, ly + 0.08, 0], FLAME.K!, 0.8, undefined, active));
    if (indicator) {
      parts.push(dropper(N('Indicator_Bottle'), N('Indicator'), [0.3, 0, 0.25]));
      if (formsBase(m, r)) {
        parts.push({
          name: N('Indicator_Pink'), parent: N('Indicator'), shape: { kind: 'cylinder', radiusTop: tr0 * 0.9, radiusBottom: tr0 * 0.9, height: lh - tr0 * 0.6, segments: 32 }, position: [0, by + tr0 * 0.6 + (lh - tr0 * 0.6) / 2, 0], color: '#ff4fa3', container: true,
          opacity: 0.6 * Math.max(0.25, rate),
          motion: (t) => ({ scale: [1, Math.max(1e-3, run ? smooth(u(t) * 1.5) : 0), 1], visible: run && u(t) > 0.03 }),
        });
      }
    }
    return parts;
  }

  if (r === 'steam') {
    // Horizontal hard-glass tube: wet mineral wool at the closed end, the metal heated in the middle, H₂ burns at the jet.
    const ty = 0.95;
    const L0 = 1.6;
    parts.push({ name: N('Vessel'), shape: { kind: 'cylinder', radiusTop: 0.13, radiusBottom: 0.13, height: L0, segments: 36, openEnded: true }, position: [x, ty, z], rotation: [0, 0, Math.PI / 2], ...glass });
    parts.push({ name: N('Vessel_End'), parent: N('Vessel'), shape: { kind: 'sphere', radius: 0.13, widthSegments: 24, hemisphere: true }, position: [0, L0 / 2, 0], ...glass });
    parts.push({ name: N('Vessel_Jet'), parent: N('Vessel'), shape: { kind: 'cylinder', radiusTop: 0.13, radiusBottom: 0.025, height: 0.16, segments: 24, openEnded: true }, position: [0, -L0 / 2 - 0.08, 0], ...glass });
    parts.push({ name: N('Liquid'), shape: { kind: 'cylinder', radiusTop: 0.11, radiusBottom: 0.11, height: 0.32, segments: 24 }, position: [x - L0 / 2 + 0.2, ty, z], rotation: [0, 0, Math.PI / 2], color: '#e9f3fb', material: 'matte' });
    parts.push(...stand2(N('Clamp'), [x - 0.5, 0, z - 0.32], ty));
    parts.push({ name: metalName, parent: metalParent, shape: metalShape(m), position: [x + 0.15, ty - 0.08, z], rotation: [0, 0, Math.PI / 2], ...metalLook, motion: (t) => ({ scale: [1, Math.max(0.3, shrink(t)), 1] }) });
    // Burners under the wool (makes steam) and under the metal.
    parts.push(...burnerAt(N('Burner'), [x + 0.15, 0, z], ty - 0.13));
    parts.push(...burnerAt(N('Burner_Wool'), [x - L0 / 2 + 0.2, 0, z], ty - 0.13));
    for (let i = 0; i < 5; i++) {
      parts.push({
        name: N(`Steam_${i + 1}`), shape: { kind: 'sphere', radius: 0.04, widthSegments: 10 }, color: '#ffffff', opacity: 0.35, container: true, noPick: true,
        motion: (t) => {
          const f = (t * 0.7 + i / 5) % 1;
          return { position: [x - L0 / 2 + 0.38 + f * 0.45, ty + 0.03 * Math.sin(i * 3 + t * 4), z], visible: run && u(t) > 0.02 };
        },
      });
    }
    if (rate > 0) {
      parts.push({
        name: N('Product_Oxide'), parent: N('Product'), shape: { kind: 'box', size: [0.3, 0.05, 0.05] }, position: [0.15, ty - 0.08, 0], color: productColor(m, r), material: 'matte',
        motion: (t) => {
          const k = Math.max(1e-3, smooth(u(t)) * rate);
          return { scale: [1, 0.6 + k, 0.6 + k], visible: run && k > 0.01 };
        },
      });
      const n = Math.round(4 + 10 * rate);
      for (let i = 0; i < n; i++) {
        parts.push({
          name: N(`Bubbles_${i + 1}`), parent: N('Bubbles'), shape: { kind: 'sphere', radius: 0.02, widthSegments: 10 }, color: '#ffffff', opacity: 0.45, container: true,
          motion: (t) => {
            const f = (t * (0.5 + rate) + i / n) % 1;
            return { position: [0.2 + f * (L0 / 2 - 0.1), ty - 0.02 + 0.04 * Math.sin(i * 5), 0.03 * Math.cos(i * 3)], visible: active(t) };
          },
        });
      }
      parts.push(flame(N('Flame_Fire'), N('Flame'), [L0 / 2 + 0.3, ty, 0], '#9fd0ff', 0.5 + 0.5 * rate, undefined, active, -Math.PI / 2));
    }
    return parts;
  }

  // Oxygen: gas jar with a little water at the bottom; the metal burns on a deflagrating spoon.
  const jr = 0.36;
  const jh = 1.5;
  const spoonY = 0.85;
  parts.push({ name: N('Vessel'), shape: { kind: 'cylinder', radiusTop: jr, radiusBottom: jr, height: jh, segments: 48, openEnded: true }, position: [x, 0.03 + jh / 2, z], ...glass });
  parts.push({ name: N('Vessel_Base'), parent: N('Vessel'), shape: { kind: 'cylinder', radiusTop: jr, radiusBottom: jr + 0.02, height: 0.04, segments: 48 }, position: [0, -jh / 2, 0], ...glass });
  parts.push({ name: N('Vessel_Lid'), parent: N('Vessel'), shape: { kind: 'cylinder', radiusTop: jr + 0.05, radiusBottom: jr + 0.05, height: 0.025, segments: 48 }, position: [0, jh / 2 + 0.012, 0], ...glass });
  parts.push({ name: N('Liquid'), shape: { kind: 'cylinder', radiusTop: jr * 0.95, radiusBottom: jr * 0.95, height: 0.14, segments: 40 }, position: [x, 0.12, z], color: '#a9d8f5', opacity: 0.5, container: true });
  parts.push({ name: N('Spoon'), shape: { kind: 'tube', from: [x, spoonY, z], to: [x, 0.03 + jh + 0.5, z], radius: 0.012 }, color: COLORS.steel, material: 'metal', noPick: true });
  parts.push({ name: N('Spoon_Cup'), shape: { kind: 'sphere', radius: 0.08, widthSegments: 20, hemisphere: true }, position: [x, spoonY, z], rotation: [Math.PI, 0, 0], color: COLORS.steel, material: 'metal', noPick: true });
  // Cu darkens (black oxide on the surface); Ag and Au don't change.
  const darken = m === 'Cu' ? (t: number) => smooth(u(t)) : () => 0;
  parts.push({ name: metalName, parent: metalParent, shape: metalShape(m), position: [x, spoonY + 0.07, z], rotation: [0, 0.4, m === 'Mg' || m === 'Cu' ? 1.2 : 0], ...metalLook, motion: (t) => {
    const k = Math.max(0.1, shrink(t));
    return { scale: [k, k, k] };
  } });
  if (m === 'Cu') {
    parts.push({
      name: N('Product_Coating'), parent: N('Product'), shape: metalShape(m), position: [0, spoonY + 0.07, 0], rotation: [0, 0.4, 1.2], scale: [1.08, 1.04, 1.4], color: productColor(m, r), material: 'matte', container: true, opacity: 0.9,
      motion: (t) => ({ visible: darken(t) > 0.05, scale: [1.08, 1.04, 1.4] }),
    });
  } else if (burns(m, r)) {
    const bright = m === 'Mg' ? 1.6 : 0.6 + 0.4 * rate;
    parts.push(flame(N('Flame_Fire'), N('Flame'), [0, spoonY + 0.2, 0], FLAME[m] ?? '#ffcc66', bright, undefined, active));
    // White smoke of the oxide rising (MgO, CaO …), and ash collecting in the water.
    for (let i = 0; i < 6; i++) {
      parts.push({
        name: N(`Product_Smoke_${i + 1}`), parent: N('Product'), shape: { kind: 'sphere', radius: 0.07, widthSegments: 12 }, color: productColor(m, r), opacity: 0.35, container: true,
        motion: (t) => {
          const f = (t * 0.35 + i / 6) % 1;
          const k = 0.6 + f;
          return { position: [Math.sin(i * 2.2) * 0.1 * f, spoonY + 0.3 + f * 0.6, Math.cos(i * 2.2) * 0.1 * f], scale: [k, k, k], visible: active(t) };
        },
      });
    }
  }
  if (indicator) {
    parts.push(dropper(N('Indicator_Bottle'), N('Indicator'), [jr + 0.22, 0, 0.2]));
    if (formsBase(m, r)) {
      parts.push({
        name: N('Indicator_Pink'), parent: N('Indicator'), shape: { kind: 'cylinder', radiusTop: jr * 0.93, radiusBottom: jr * 0.93, height: 0.145, segments: 40 }, position: [0, 0.12, 0], color: '#ff4fa3', opacity: 0.65, container: true,
        motion: (t) => ({ visible: run && u(t) > 0.5 }),
      });
    }
  }
  return parts;
}

/** A flame: an emissive cone with a glow, flickering while `active`. */
function flame(name: string, parent: string, at: Vec3, color: string, size: number, follow: Part['motion'] | undefined, active: (t: number) => boolean, rotZ = 0): Part {
  return {
    name, parent, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.07 * size, height: 0.3 * size, segments: 20 }, position: at, rotation: [0, 0, rotZ],
    color, material: 'emissive', glow: 1.3 + size * 0.4, opacity: 0.9, container: true, halo: { color, size: 0.6 + 0.8 * size, strength: Math.min(1, 0.4 + 0.35 * size) },
    motion: (t) => {
      const f = 1 + 0.12 * Math.sin(t * 19) + 0.08 * Math.sin(t * 31);
      return { ...(follow ? follow(t) : {}), scale: [1, f, 1], visible: active(t) };
    },
  };
}

/** Phenolphthalein dropper bottle (decoration under the Indicator group). */
function dropper(name: string, parent: string, at: Vec3): Part {
  return { name, parent, shape: { kind: 'lathe', segments: 24, profile: [[0, 0], [0.08, 0], [0.085, 0.16], [0.03, 0.2], [0.025, 0.26], [0.012, 0.3], [0, 0.31]] }, position: at, color: '#8a5a2b', material: 'glass' };
}

function burnerAt(name: string, at: Vec3, top: number): Part[] {
  const h = Math.max(0.2, top - 0.25);
  return [
    { name, shape: { kind: 'group' }, position: at },
    { name: `${name}_Foot`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.12, radiusBottom: 0.15, height: 0.04, segments: 28 }, position: [0, 0.02, 0], color: '#3d4654', material: 'metal' },
    { name: `${name}_Tube`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.035, radiusBottom: 0.04, height: h, segments: 20 }, position: [0, h / 2 + 0.04, 0], color: COLORS.steel, material: 'brushed' },
    {
      name: `${name}_Flame`, parent: name, shape: { kind: 'cylinder', radiusTop: 0, radiusBottom: 0.04, height: 0.2, segments: 16 }, position: [0, h + 0.14, 0], color: '#5aa9ff', material: 'emissive', glow: 1.4, opacity: 0.85, container: true, noPick: true,
      halo: { color: '#6fb3ff', size: 0.35, strength: 0.4 },
      motion: (t) => ({ scale: [1, 1 + 0.1 * Math.sin(t * 17), 1] }),
    },
  ];
}

function stand2(name: string, at: Vec3, y: number): Part[] {
  return [
    { name, shape: { kind: 'box', size: [0.5, 0.04, 0.35], bevel: 0.012 }, position: [at[0], 0.02, at[2]], color: '#3d4654', material: 'plastic', noPick: true },
    { name: `${name}_Rod`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.015, radiusBottom: 0.015, height: y + 0.3, segments: 12 }, position: [0, (y + 0.3) / 2, 0], color: COLORS.steel, material: 'brushed', noPick: true },
    { name: `${name}_Arm`, parent: name, shape: { kind: 'tube', from: [0, y - 0.02, 0], to: [0, y - 0.02, 0.32], radius: 0.012 }, color: COLORS.steel, material: 'brushed', noPick: true },
  ];
}
