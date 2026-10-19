/**
 * `separation` (5.2 separating mixtures): lab apparatus for filtration,
 * evaporation, distillation, paper chromatography, magnetic separation and
 * decanting; «run» animates the method, otherwise the scene shows its result.
 */
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import { COLORS, L, LABELS, MODE, beaker, burner, clamp, enumOr, hashStr, liquid, obj, on, rng, smooth, text, tr, type SimModel } from './common.js';

export const METHODS = ['filtration', 'evaporation', 'distillation', 'chromatography', 'magnet', 'decanting'] as const;
export type SeparationMethod = (typeof METHODS)[number];

export interface SeparationParams {
  method: SeparationMethod;
  mixture?: string;
}
export const DEFAULT_SEPARATION: SeparationParams = { method: 'filtration' };

export function parseSeparationParams(raw: unknown): SeparationParams {
  const p = obj(raw);
  const mixture = typeof p.mixture === 'string' && p.mixture.trim() ? p.mixture.trim().slice(0, 80) : undefined;
  return { method: enumOr(p.method, METHODS, DEFAULT_SEPARATION.method), mixture };
}

/** Named parts every method draws (the contract with content). */
export const SEPARATION_PARTS: Record<SeparationMethod, readonly string[]> = {
  filtration: ['Funnel', 'FilterPaper', 'Beaker', 'Residue', 'Filtrate'],
  evaporation: ['Dish', 'Burner', 'Crystals', 'Vapour'],
  distillation: ['Flask', 'Burner', 'Thermometer', 'Condenser', 'Distillate', 'Receiver'],
  chromatography: ['Paper', 'Solvent', 'Spot_1', 'Spot_2', 'Spot_3', 'SolventFront'],
  magnet: ['Magnet', 'IronFilings', 'Sand'],
  decanting: ['Beaker', 'Sediment', 'Liquid'],
};

/** Chromatography: retention factors and colours of the three dyes in the ink spot. */
export const DYES = [
  { rf: 0.82, color: '#f9c74f' },
  { rf: 0.56, color: '#f94144' },
  { rf: 0.3, color: '#277da1' },
] as const;

const METHOD_TITLE: Record<SeparationMethod, ReturnType<typeof L>> = {
  filtration: L('Чыпкалоо', 'Фильтрование', 'Filtration'),
  evaporation: L('Буулантуу', 'Выпаривание', 'Evaporation'),
  distillation: L('Дистилляция', 'Дистилляция', 'Distillation'),
  chromatography: L('Хроматография', 'Хроматография', 'Chromatography'),
  magnet: L('Магнит менен бөлүү', 'Разделение магнитом', 'Magnetic separation'),
  decanting: L('Тундуруу', 'Отстаивание и сливание', 'Decanting'),
};

/** One run of the method, s (free clock loops with a pause). */
export const SEPARATION_RUN = 10;
const RUN = SEPARATION_RUN;
const PAUSE = 2;

const GLASS = { color: COLORS.glass, material: 'glass', container: true } as const;
const WATER = '#7cc4ee';
const MUD = '#8a6a43';
const SAND = '#d8c08f';

/** Closed lathe profile with a wall: outer points, then the inner surface back to the axis. */
function shell(profile: [number, number][], wall: number): [number, number][] {
  const inner = [...profile].reverse().map(([r, y]): [number, number] => [Math.max(0, r - wall), y + (r < wall ? wall : 0)]);
  return [...profile, ...inner];
}

/** Clamp stand (decoration): base plate, rod and a boss head at `y`. */
function stand(name: string, x: number, z: number, h: number, armTo: number, y: number): Part[] {
  return [
    { name, shape: { kind: 'box', size: [0.7, 0.04, 0.5], bevel: 0.015 }, position: [x, 0.02, z], color: '#3d4654', material: 'plastic', noPick: true },
    { name: `${name}_Rod`, parent: name, shape: { kind: 'cylinder', radiusTop: 0.018, radiusBottom: 0.018, height: h, segments: 16 }, position: [-0.2, h / 2, 0], color: COLORS.steel, material: 'brushed', noPick: true },
    { name: `${name}_Arm`, parent: name, shape: { kind: 'tube', from: [-0.2, y, 0], to: [armTo - x, y, -z], radius: 0.014 }, color: COLORS.steel, material: 'brushed', noPick: true },
  ];
}

/**
 * Optional «method» segment (one mode per method, default = the `method` param): a lesson that
 * lists these ids in `scene.modes` can switch the apparatus from the panel or a tour step
 * (`modes: { method: 'distillation' }`). Without them in `scene.modes` the panel stays run + labels.
 */
const methodModes = (current: SeparationMethod) =>
  METHODS.map((m) => ({ id: m, label: METHOD_TITLE[m], group: 'method', ...(m === current ? { default: true } : {}) }));

export const separation: SimModel = {
  id: 'separation',
  modes: [MODE.run(true), LABELS, ...methodModes(DEFAULT_SEPARATION.method)],
  modesFor: (raw) => [MODE.run(true), LABELS, ...methodModes(parseSeparationParams(raw).method)],
  clock: (_raw, pb, free) => (pb ? pb.fraction * RUN : Math.min(free % (RUN + PAUSE), RUN)),
  build(raw, { modes, lang = 'ru' }) {
    const p0 = parseSeparationParams(raw);
    const p = { ...p0, method: enumOr(modes.method, METHODS, p0.method) };
    const run = on(modes, 'run');
    /** Progress 0..1 of the method (1 = finished, when not running). */
    const u = (t: number) => (run ? clamp(t / RUN, 0, 1) : 1);
    const parts = BUILDERS[p.method](u, run);
    if (on(modes, 'labels')) {
      const title = tr(METHOD_TITLE[p.method], lang);
      parts.push(text('Method_Label', p.mixture ? `${title}\n${p.mixture}` : title, [0, 2.75, 0], 0.17, { bold: true }));
    }
    return parts;
  },
};

type Builder = (u: (t: number) => number, run: boolean) => Part[];

const filtration: Builder = (u, run) => {
  const fy = 1.25; // stem tip
  const parts: Part[] = [
    ...stand('Stand', -0.55, -0.1, 2.5, 0, fy + 0.85),
    { name: 'Stand_Ring', shape: { kind: 'torus', radius: 0.42, tube: 0.016, segments: 48 }, position: [0, fy + 0.85, 0], rotation: [Math.PI / 2, 0, 0], color: COLORS.steel, material: 'brushed', noPick: true },
    // Glass funnel: stem and cone.
    { name: 'Funnel', shape: { kind: 'lathe', segments: 48, profile: [[0.035, 0], [0.04, 0.55], [0.07, 0.62], [0.5, 1.12], [0.53, 1.15]] }, position: [0, fy, 0], ...GLASS },
    { name: 'FilterPaper', shape: { kind: 'lathe', segments: 48, profile: [[0.012, 0.66], [0.47, 1.12], [0.48, 1.18]] }, position: [0, fy, 0], color: '#f6f3ea', material: 'matte', opacity: 0.45, container: true },
    // Residue collects in the tip of the filter cone.
    {
      name: 'Residue', shape: { kind: 'cylinder', radiusTop: 0.2, radiusBottom: 0.03, height: 0.2, segments: 32 }, position: [0, fy + 0.77, 0], color: MUD, material: 'matte',
      motion: (t) => {
        const k = 0.3 + 0.7 * u(t);
        return { scale: [k, k, k], position: [0, fy + 0.67 + 0.1 * k, 0] };
      },
    },
    // Muddy mixture in the funnel, going down as it filters.
    {
      name: 'Mixture', shape: { kind: 'cylinder', radiusTop: 0.4, radiusBottom: 0.1, height: 0.38, segments: 32 }, position: [0, fy + 0.93, 0], color: MUD, opacity: 0.75, container: true,
      motion: (t) => {
        const k = 1 - u(t);
        return { scale: [0.35 + 0.65 * k, Math.max(1e-3, k), 0.35 + 0.65 * k], position: [0, fy + 0.74 + 0.19 * k, 0], visible: k > 0.02 };
      },
    },
    ...beaker('Beaker', [0, 0, 0], 0.42, 0.95, { container: true }),
    liquid('Filtrate', [0, 0.03, 0], 0.39, 0.6, WATER, (t) => 0.05 + 0.95 * u(t)),
  ];
  if (run) parts.push(...drops('Filtrate_Drop', [0, fy, 0], 0.4, WATER, (t) => u(t) < 0.98));
  return parts;
};

/** Drops falling from `from` by `fall` while `active(t)`. */
function drops(name: string, from: Vec3, fall: number, color: string, active: (t: number) => boolean): Part[] {
  return [0, 1, 2].map((i) => ({
    name: `${name}_${i + 1}`, shape: { kind: 'sphere', radius: 0.028, widthSegments: 12 }, color, material: 'glass', noPick: true,
    motion: (t: number) => {
      const f = (t * 1.2 + i / 3) % 1;
      return { position: [from[0], from[1] - f * f * fall, from[2]] as Vec3, visible: active(t) };
    },
  }));
}

const evaporation: Builder = (u, run) => {
  const gy = 0.95; // gauze top
  const parts: Part[] = [
    { name: 'Tripod', shape: { kind: 'torus', radius: 0.45, tube: 0.02, segments: 40 }, position: [0, gy - 0.02, 0], rotation: [Math.PI / 2, 0, 0], color: '#5c6676', material: 'metal', noPick: true },
    ...[0, 1, 2].map((i): Part => {
      const a = (i / 3) * Math.PI * 2;
      return { name: `Tripod_Leg_${i + 1}`, parent: 'Tripod', shape: { kind: 'tube', from: [0.45 * Math.cos(a), 0.45 * Math.sin(a), 0], to: [0.55 * Math.cos(a), 0.55 * Math.sin(a), gy - 0.02], radius: 0.018 }, color: '#5c6676', material: 'metal', noPick: true };
    }),
    { name: 'Gauze', shape: { kind: 'box', size: [0.95, 0.015, 0.95] }, position: [0, gy, 0], color: '#9aa4b2', texture: 'grid', textureScale: 12, material: 'metal', noPick: true },
    { name: 'Gauze_Centre', parent: 'Gauze', shape: { kind: 'cylinder', radiusTop: 0.22, radiusBottom: 0.22, height: 0.018, segments: 32 }, color: '#e9ecef', material: 'matte', noPick: true },
    ...burner('Burner', [0, 0, 0], 1.25, true),
    // Porcelain evaporating dish with a wall.
    { name: 'Dish', shape: { kind: 'lathe', segments: 48, profile: shell([[0, 0], [0.3, 0.015], [0.48, 0.1], [0.56, 0.22], [0.58, 0.24]], 0.025) }, position: [0, gy + 0.008, 0], color: '#f3f1ea', material: 'plastic' },
    {
      name: 'Dish_Solution', shape: { kind: 'cylinder', radiusTop: 0.48, radiusBottom: 0.3, height: 0.16, segments: 40 }, position: [0, gy + 0.11, 0], color: '#5fb4e8', opacity: 0.7, container: true,
      motion: (t) => {
        const k = 1 - smooth(u(t) / 0.85);
        return { scale: [0.65 + 0.35 * k, Math.max(1e-3, k), 0.65 + 0.35 * k], position: [0, gy + 0.03 + 0.08 * k, 0], visible: k > 0.02 };
      },
    },
    { name: 'Crystals', shape: { kind: 'group' }, position: [0, gy + 0.04, 0] },
  ];
  const rand = rng(hashStr('crystals'));
  for (let i = 0; i < 16; i++) {
    const r = 0.32 * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    const s = 0.045 + rand() * 0.04;
    const appear = 0.35 + rand() * 0.45;
    const rot: Vec3 = [rand() * 3, rand() * 3, rand() * 3];
    parts.push({
      name: `Crystals_${i + 1}`, parent: 'Crystals', shape: { kind: 'box', size: [s, s, s] }, position: [r * Math.cos(a), s / 2 + r * r * 0.35, r * Math.sin(a)], rotation: rot, color: '#9ec9f0', material: 'plastic', edges: '#3f6f9e',
      motion: (t) => {
        const k = clamp((u(t) - appear) / 0.2, 0, 1);
        return { scale: [Math.max(1e-3, k), Math.max(1e-3, k), Math.max(1e-3, k)], visible: k > 0.01 };
      },
    });
  }
  parts.push({ name: 'Vapour', shape: { kind: 'group' }, position: [0, gy + 0.2, 0] });
  for (let i = 0; i < 7; i++) {
    const x0 = ((i % 3) - 1) * 0.16;
    parts.push({
      name: `Vapour_${i + 1}`, parent: 'Vapour', shape: { kind: 'sphere', radius: 0.09, widthSegments: 16 }, color: '#ffffff', opacity: 0.3, container: true,
      motion: (t) => {
        const f = (t * 0.45 + i / 7) % 1;
        const k = 0.6 + f * 1.4;
        return { position: [x0 + Math.sin(t + i) * 0.06 * f, f * 1.3, ((i % 2) - 0.5) * 0.12], scale: [k, k, k], visible: !run || u(t) < 0.9 };
      },
    });
  }
  return parts;
};

const distillation: Builder = (u, run) => {
  const fx = -1.55;
  const fr = 0.42;
  const fyc = 0.95 + fr; // flask centre
  const neckTop = fyc + fr + 0.55;
  const armY = neckTop - 0.18;
  const c0: Vec3 = [fx + 0.32, armY - 0.06, 0];
  const c1: Vec3 = [0.95, 0.98, 0];
  const dir: Vec3 = [c1[0] - c0[0], c1[1] - c0[1], 0];
  const cLen = Math.hypot(dir[0], dir[1]);
  const rx = 1.12;
  const boil = (t: number) => clamp((u(t) - 0.12) / 0.8, 0, 1);
  const parts: Part[] = [
    ...stand('Stand', fx - 0.35, -0.2, 2.9, fx, fyc + fr + 0.25),
    ...burner('Burner', [fx, 0, 0], 1.25, true),
    { name: 'Flask', shape: { kind: 'sphere', radius: fr, widthSegments: 48 }, position: [fx, fyc, 0], ...GLASS },
    { name: 'Flask_Neck', parent: 'Flask', shape: { kind: 'cylinder', radiusTop: 0.08, radiusBottom: 0.09, height: 0.6, segments: 32, openEnded: true }, position: [0, fr + 0.26, 0], ...GLASS },
    { name: 'Flask_Arm', parent: 'Flask', shape: { kind: 'tube', from: [0.05, armY - fyc, 0], to: [c0[0] - fx, c0[1] - fyc, 0], radius: 0.035 }, ...GLASS },
    {
      // Liquid in the flask boils down.
      name: 'Flask_Liquid', shape: { kind: 'sphere', radius: fr * 0.93, widthSegments: 40, hemisphere: true }, position: [fx, fyc, 0], rotation: [Math.PI, 0, 0], color: '#c9a7e8', opacity: 0.6, container: true,
      motion: (t) => ({ scale: [1, Math.max(0.15, 0.85 - 0.6 * boil(t)), 1] }),
    },
    // Thermometer: bulb level with the side arm, red column rises to the boiling point.
    { name: 'Thermometer', shape: { kind: 'cylinder', radiusTop: 0.022, radiusBottom: 0.022, height: 1.05, segments: 16 }, position: [fx, armY + 0.48, 0], ...GLASS, container: false },
    { name: 'Thermometer_Bulb', parent: 'Thermometer', shape: { kind: 'sphere', radius: 0.034, widthSegments: 16 }, position: [0, -0.52, 0], color: '#e63946', material: 'plastic' },
    {
      name: 'Thermometer_Column', parent: 'Thermometer', shape: { kind: 'cylinder', radiusTop: 0.009, radiusBottom: 0.009, height: 1, segments: 8 }, color: '#e63946', material: 'emissive', glow: 1,
      motion: (t) => {
        const h = 0.12 + 0.55 * smooth(u(t) / 0.2);
        return { scale: [1, h, 1], position: [0, -0.52 + h / 2, 0] };
      },
    },
    { name: 'Stopper', shape: { kind: 'cylinder', radiusTop: 0.1, radiusBottom: 0.08, height: 0.1, segments: 24 }, position: [fx, neckTop - 0.02, 0], color: '#3a3f47', material: 'rubber', noPick: true },
    // Liebig condenser: water jacket around the inner tube, inlet low, outlet high.
    { name: 'Condenser', shape: { kind: 'tube', from: c0, to: c1, radius: 0.1 }, color: '#bfe6ff', material: 'glass', container: true, opacity: 0.4 },
    // Tube parts are local to their span: Y runs along the condenser from its middle.
    { name: 'Condenser_Inner', parent: 'Condenser', shape: { kind: 'tube', from: [0, -cLen / 2 - 0.1, 0], to: [0, cLen / 2 + 0.1, 0], radius: 0.03 }, ...GLASS, noPick: true },
    { name: 'Condenser_WaterIn', shape: { kind: 'tube', from: [c1[0] - dir[0] * 0.12, c1[1] - dir[1] * 0.12 - 0.08, 0], to: [c1[0] - dir[0] * 0.12, c1[1] - dir[1] * 0.12 - 0.3, 0], radius: 0.025 }, color: '#4aa3df', material: 'rubber', noPick: true },
    { name: 'Condenser_WaterOut', shape: { kind: 'tube', from: [c0[0] + dir[0] * 0.12, c0[1] + dir[1] * 0.12 + 0.08, 0], to: [c0[0] + dir[0] * 0.12, c0[1] + dir[1] * 0.12 + 0.3, 0], radius: 0.025 }, color: '#4aa3df', material: 'rubber', noPick: true },
    // Conical receiver flask.
    { name: 'Receiver', shape: { kind: 'lathe', segments: 48, profile: [[0, 0], [0.36, 0], [0.38, 0.03], [0.12, 0.62], [0.11, 0.8]] }, position: [rx, 0, 0], ...GLASS },
    {
      name: 'Distillate', shape: { kind: 'cylinder', radiusTop: 0.27, radiusBottom: 0.36, height: 0.2, segments: 40 }, position: [rx, 0.1, 0], color: '#bfe8ff', opacity: 0.65, container: true,
      motion: (t) => {
        const k = Math.max(0.02, boil(t));
        return { scale: [1, k, 1], position: [rx, 0.02 + 0.1 * k, 0], visible: boil(t) > 0.01 };
      },
    },
  ];
  // The condenser's lower end bends down into the receiver's mouth.
  parts.push({ name: 'Condenser_Tip', shape: { kind: 'tube', from: c1, to: [rx, 0.7, 0], radius: 0.028 }, ...GLASS });
  if (run) {
    parts.push(...drops('Distillate_Drop', [rx, 0.68, 0], 0.45, '#bfe8ff', (t) => boil(t) > 0.02 && boil(t) < 0.999));
    for (let i = 0; i < 6; i++) {
      parts.push({
        name: `Flask_Bubble_${i + 1}`, shape: { kind: 'sphere', radius: 0.03, widthSegments: 10 }, color: '#ffffff', opacity: 0.6, container: true, noPick: true,
        motion: (t) => {
          const f = (t * 0.9 + i / 6) % 1;
          return { position: [fx + Math.sin(i * 2.1) * 0.2, fyc - fr * 0.8 + f * fr * 0.7, Math.cos(i * 2.1) * 0.15], visible: boil(t) > 0 && boil(t) < 0.999 };
        },
      });
    }
  }
  return parts;
};

const chromatography: Builder = (u) => {
  const base = 0.5; // pencil line
  const solventY = 0.32;
  const top = 2.05;
  const front = (t: number) => solventY + (top - 0.18 - solventY) * smooth(u(t));
  const pw = 0.6;
  const parts: Part[] = [
    ...beaker('Beaker', [0, 0, 0], 0.55, 2.2, { container: true }),
    liquid('Solvent', [0, 0.03, 0], 0.52, solventY - 0.03, '#bfe6ff'),
    { name: 'Rod', shape: { kind: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: 1.5, segments: 12 }, position: [0, 2.28, 0], rotation: [0, 0, Math.PI / 2], color: '#c69c6d', material: 'wood', noPick: true },
    { name: 'Clip', shape: { kind: 'box', size: [0.2, 0.12, 0.06], bevel: 0.01 }, position: [0, 2.2, 0], color: '#3d4654', material: 'metal', noPick: true },
    { name: 'Paper', shape: { kind: 'box', size: [pw, top - 0.12, 0.01] }, position: [0, (top + 0.12) / 2, 0], color: '#fbfaf4', material: 'matte' },
    // Wet part of the paper grows with the solvent front.
    {
      name: 'Paper_Wet', parent: 'Paper', shape: { kind: 'box', size: [pw * 1.002, 1, 0.012] }, color: '#dcecf7', material: 'matte', noPick: true,
      motion: (t) => {
        const h = Math.max(1e-3, front(t) - 0.12);
        return { scale: [1, h, 1], position: [0, 0.12 + h / 2 - (top + 0.12) / 2, 0] };
      },
    },
    { name: 'Baseline', shape: { kind: 'box', size: [pw * 0.9, 0.008, 0.004] }, position: [0, base, 0.011], color: '#6c757d', noPick: true },
    { name: 'SolventFront', shape: { kind: 'box', size: [pw * 1.02, 0.016, 0.02] }, color: '#4aa3df', material: 'emissive', glow: 1, motion: (t) => ({ position: [0, front(t), 0.008] }) },
  ];
  DYES.forEach((d, i) => {
    // Each dye travels Rf × the solvent's distance from the baseline.
    const y = (t: number) => base + d.rf * Math.max(0, front(t) - base);
    parts.push({
      name: `Spot_${i + 1}`, shape: { kind: 'cylinder', radiusTop: 0.06, radiusBottom: 0.06, height: 0.006, segments: 28 }, rotation: [Math.PI / 2, 0, 0], color: d.color, material: 'matte', opacity: 0.92,
      motion: (t) => {
        const stretch = 1 + 0.8 * clamp((y(t) - base) / 1.2, 0, 1);
        return { position: [0, y(t), 0.009 + i * 0.001], scale: [1, 1, stretch] };
      },
    });
  });
  return parts;
};

const magnet: Builder = (u) => {
  const dishY = 0.08;
  const rest: Vec3 = [0, 2.1, 0];
  const low: Vec3 = [0, 0.62, 0];
  // Down (0–0.3), filings jump (0.3–0.65), lift (0.65–1).
  const magPos = (t: number): Vec3 => {
    const x = u(t);
    const k = x < 0.3 ? smooth(x / 0.3) : x < 0.65 ? 1 : 1 - smooth((x - 0.65) / 0.35);
    return [0, rest[1] + (low[1] - rest[1]) * k, 0];
  };
  const legX = 0.28;
  const legLen = 0.42;
  const parts: Part[] = [
    { name: 'Dish', shape: { kind: 'cylinder', radiusTop: 0.85, radiusBottom: 0.75, height: 0.1, segments: 48 }, position: [0, dishY / 2, 0], color: '#e9ecef', material: 'glass', container: true, noPick: true },
    { name: 'Magnet', shape: { kind: 'group' }, position: magPos(0), motion: (t) => ({ position: magPos(t) }) },
    { name: 'Magnet_Arch', parent: 'Magnet', shape: { kind: 'torus', radius: legX, tube: 0.09, arc: Math.PI, segments: 40 }, position: [0, legLen, 0], color: '#d62828', material: 'plastic' },
    { name: 'Magnet_Leg_1', parent: 'Magnet', shape: { kind: 'box', size: [0.18, legLen, 0.18] }, position: [-legX, legLen / 2, 0], color: '#d62828', material: 'plastic' },
    { name: 'Magnet_Leg_2', parent: 'Magnet', shape: { kind: 'box', size: [0.18, legLen, 0.18] }, position: [legX, legLen / 2, 0], color: '#d62828', material: 'plastic' },
    { name: 'Magnet_Pole_N', parent: 'Magnet', shape: { kind: 'box', size: [0.185, 0.12, 0.185] }, position: [-legX, 0.06, 0], color: '#dee2e6', material: 'metal' },
    { name: 'Magnet_Pole_S', parent: 'Magnet', shape: { kind: 'box', size: [0.185, 0.12, 0.185] }, position: [legX, 0.06, 0], color: '#dee2e6', material: 'metal' },
  ];
  const rand = rng(hashStr('magnet'));
  const heap = (n: number, r: number): Vec3[] =>
    Array.from({ length: n }, () => {
      const rr = r * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      const h = 0.13 * (1 - (rr / r) ** 2);
      return [rr * Math.cos(a), dishY + 0.02 + rand() * h, rr * Math.sin(a)];
    });
  const sand = heap(260, 0.62);
  const iron = heap(90, 0.6);
  // Where each filing clings: a tuft under one of the poles.
  const tuft: Vec3[] = iron.map((_, i) => {
    const side = i % 2 ? legX : -legX;
    return [side + (rand() - 0.5) * 0.17, -0.02 - rand() * 0.12, (rand() - 0.5) * 0.17];
  });
  parts.push({ name: 'Sand', shape: { kind: 'instances', positions: sand, radius: 0.022 }, color: SAND, material: 'matte' });
  const filing = (t: number, i: number): Vec3 => {
    const x = u(t);
    const m = magPos(t);
    const delay = (i % 9) * 0.025;
    const k = smooth((x - 0.3 - delay) / 0.15);
    const h = iron[i];
    const g: Vec3 = [m[0] + tuft[i][0], m[1] + tuft[i][1], m[2] + tuft[i][2]];
    return [h[0] + (g[0] - h[0]) * k, h[1] + (g[1] - h[1]) * k, h[2] + (g[2] - h[2]) * k];
  };
  parts.push({ name: 'IronFilings', shape: { kind: 'instances', positions: iron.map((_, i) => filing(0, i)), radius: 0.018 }, color: '#3b3f46', material: 'metal', instanceMotion: filing });
  return parts;
};

const decanting: Builder = (u, run) => {
  // Source beaker on the left tilts about its right lip; the clear liquid pours into a second beaker.
  const r = 0.42;
  const h = 1.0;
  const lift = 0.55; // the source stands on a block
  const src: Vec3 = [-0.75, lift, 0];
  const lip: Vec3 = [src[0] + r, lift + h, 0];
  const tilt = (t: number) => {
    const x = u(t);
    return -(Math.PI / 180) * 62 * (x < 0.2 ? smooth(x / 0.2) : x < 0.8 ? 1 : 1 - smooth((x - 0.8) / 0.2));
  };
  const poured = (t: number) => clamp((u(t) - 0.15) / 0.65, 0, 1);
  /** World transform of a point of the source beaker (local to its bottom centre) at tilt φ about the lip. */
  const at = (local: Vec3, phi: number): Vec3 => {
    const x = src[0] + local[0] - lip[0];
    const y = src[1] + local[1] - lip[1];
    return [lip[0] + x * Math.cos(phi) - y * Math.sin(phi), lip[1] + x * Math.sin(phi) + y * Math.cos(phi), local[2]];
  };
  const rx = 0.85;
  const parts: Part[] = [
    { name: 'Block', shape: { kind: 'box', size: [1.1, lift, 0.9], bevel: 0.02 }, position: [src[0], lift / 2, 0], color: '#c69c6d', material: 'wood', noPick: true },
    {
      name: 'Beaker', shape: { kind: 'cylinder', radiusTop: r, radiusBottom: r * 0.97, height: h, segments: 48, openEnded: true }, ...GLASS,
      motion: (t) => ({ position: at([0, h / 2, 0], tilt(t)), rotation: [0, 0, tilt(t)] }),
    },
    { name: 'Beaker_Base', parent: 'Beaker', shape: { kind: 'cylinder', radiusTop: r * 0.97, radiusBottom: r * 0.95, height: 0.03, segments: 48 }, position: [0, -h / 2 + 0.015, 0], ...GLASS },
    {
      name: 'Sediment', shape: { kind: 'cylinder', radiusTop: r * 0.93, radiusBottom: r * 0.92, height: 0.16, segments: 40 }, color: MUD, material: 'matte',
      motion: (t) => ({ position: at([0, 0.11, 0], tilt(t)), rotation: [0, 0, tilt(t)] }),
    },
    { name: 'Liquid', shape: { kind: 'group' } },
    {
      name: 'Liquid_Source', parent: 'Liquid', shape: { kind: 'cylinder', radiusTop: r * 0.93, radiusBottom: r * 0.93, height: 1, segments: 40 }, color: WATER, opacity: 0.55, container: true,
      motion: (t) => {
        const hh = Math.max(0.02, 0.62 * (1 - 0.92 * poured(t)));
        return { position: at([0, 0.19 + hh / 2, 0], tilt(t)), rotation: [0, 0, tilt(t)], scale: [1, hh, 1] };
      },
    },
    {
      name: 'Liquid_Stream', parent: 'Liquid', shape: { kind: 'tube', from: [lip[0] + 0.02, lip[1] - 0.02, 0], to: [rx - 0.15, 0.25, 0], radius: 0.025 }, color: WATER, opacity: 0.7, container: true,
      motion: (t) => ({ visible: run && poured(t) > 0.01 && poured(t) < 0.99 }),
    },
    ...beaker('Beaker_2', [rx, 0, 0], r, h, { container: true }),
    liquid('Liquid_Received', [rx, 0.03, 0], r * 0.93, 0.55, WATER, (t) => poured(t), { parent: 'Liquid' }),
  ];
  return parts;
};

const BUILDERS: Record<SeparationMethod, Builder> = { filtration, evaporation, distillation, chromatography, magnet, decanting };
