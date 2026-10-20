import { describe, it, expect } from 'vitest';
import { defaultModeState, resolveModes } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';
import { MODELS, SIM_MODELS, modelFor } from '../models.js';
import { simPlugin } from '../index.js';
import { DEFAULT_KINEMATICS, distanceTimePoints, kinematicsState, markerSpacing, parseKinematicsParams } from './kinematics.js';
import { DEFAULT_FORCES, forcesMotion, forcesState, parseForcesParams } from './forces.js';
import { leverState, leverTilt, parseLeverParams } from './lever.js';
import { DEFAULT_PARTICLES, dissolvedCount, parseParticlesParams, solventOf, thermalSpeed } from './particles.js';
import { METHODS, SEPARATION_PARTS, parseSeparationParams } from './separation.js';
import { REAGENTS, SERIES, H_INDEX, equation, formsBase, parseReactionParams, reactionRate } from './reactionVessel.js';
import { RECORD, REACT, energyProfile, humpEnergy, parseEnergyProfileParams, temperatureAt } from './energyProfile.js';
import { energyShare, iconFor, parseFoodWebParams, pollutantLevels, reactedCounts } from './foodWeb.js';
import { DEFAULT_FOODS, foodKcal, nutritionSummary, parseNutritionParams, testResult } from './nutritionPlate.js';

const NEW = ['kinematics', 'forces', 'lever', 'particles', 'separation', 'reaction-vessel', 'energy-profile', 'food-web', 'nutrition-plate'] as const;
/** Physics 7 models (no dev mock package each): registration and robustness only. */
const PHYS7 = ['circular', 'spring', 'momentum', 'pulley', 'pressure', 'buoyancy', 'waves'] as const;

/** Build with every mode of the model on. */
function build(model: string, params: Record<string, unknown>, modes: Record<string, boolean> = {}, extra: Record<string, unknown> = {}): Part[] {
  const m = MODELS[model as keyof typeof MODELS];
  const all = Object.fromEntries(m.modes.map((d) => [d.id, true]));
  return m.build({ model, ...params }, { modes: { ...all, ...modes }, lang: 'ru', ...extra });
}
const names = (parts: Part[]) => new Set(parts.map((p) => p.name));
function expectParts(parts: Part[], expected: string[]) {
  const n = names(parts);
  for (const e of expected) expect(n, e).toContain(e);
}

describe('registration and robustness', () => {
  it('every new model is registered and its modes resolve', () => {
    for (const id of [...NEW, ...PHYS7]) {
      expect(SIM_MODELS).toContain(id);
      expect(modelFor({ model: id }).id).toBe(id);
      const ids = simPlugin.modes({ plugin: 'sim', params: { model: id }, modes: [] } as never).map((d) => d.id);
      expect(ids.length).toBeGreaterThan(0);
    }
  });
  it('garbage params never throw; parts are uniquely named and motions run', () => {
    const junk: unknown[] = [{}, { segments: 'x', forces: [null, 3], loads: {}, species: [{ id: '' }], method: 42, metal: 'Xx', kind: 7, organisms: [{ id: 'a' }], foods: [{}] }, { foo: NaN }];
    for (const id of [...NEW, ...PHYS7]) {
      for (const j of junk) {
        for (const allOn of [true, false]) {
          const m = MODELS[id];
          const modes = allOn ? Object.fromEntries(m.modes.map((d) => [d.id, true])) : defaultModeState(resolveModes(m.modes, []));
          const parts = m.build({ model: id, ...(j as object) }, { modes });
          expect(parts.length, id).toBeGreaterThan(0);
          expect(new Set(parts.map((p) => p.name)).size, `${id} unique names`).toBe(parts.length);
          const byName = names(parts);
          for (const p of parts) if (p.parent) expect(byName, `${id}: parent of ${p.name}`).toContain(p.parent);
          for (const t of [0, 0.5, 3, 50]) {
            const c = m.clock({ model: id }, undefined, t);
            expect(Number.isFinite(c), id).toBe(true);
            for (const p of parts) {
              const r = p.motion?.(c);
              for (const v of [r?.position, r?.scale, r?.rotation]) if (v) expect(v.every(Number.isFinite), `${id} ${p.name}`).toBe(true);
              if (p.instanceMotion && p.shape.kind === 'instances') expect(p.instanceMotion(c, 0).every(Number.isFinite)).toBe(true);
            }
          }
        }
      }
    }
  });
  it('defaults as specified', () => {
    expect(simPlugin.modes({ plugin: 'sim', params: { model: 'kinematics' }, modes: [] } as never).find((d) => d.id === 'graph')?.default).toBe(true);
    expect(MODELS.forces.modes.find((d) => d.id === 'vectors')?.default).toBe(true);
    expect(MODELS.lever.modes.find((d) => d.id === 'arms')?.default).toBe(true);
    expect(MODELS.particles.modes.find((d) => d.id === 'motion')?.default).toBe(true);
    expect(MODELS.separation.modes.find((d) => d.id === 'run')?.default).toBe(true);
    expect(MODELS['reaction-vessel'].modes.find((d) => d.id === 'run')?.default).toBe(true);
    expect(MODELS['energy-profile'].modes.find((d) => d.id === 'graph')?.default).toBe(true);
    expect(MODELS['food-web'].modes.find((d) => d.id === 'energy')?.default).toBe(true);
    expect(MODELS['nutrition-plate'].modes.find((d) => d.id === 'groups')?.default).toBe(true);
    expect(MODELS['nutrition-plate'].modes.find((d) => d.id === 'energy')?.default).toBeFalsy();
  });
});

describe('kinematics', () => {
  it('lenient params and defaults', () => {
    expect(parseKinematicsParams({})).toEqual(DEFAULT_KINEMATICS);
    expect(parseKinematicsParams({ segments: [{ v: -1, t: 2 }, { v: 5, t: 0 }, { v: 3, t: 4 }], markEvery: -2 })).toEqual({ ...DEFAULT_KINEMATICS, segments: [{ v: 3, t: 4 }] });
  });
  it('s(t) piecewise, stop is flat, clamped at the end', () => {
    const segs = [{ v: 10, t: 5 }, { v: 0, t: 3 }, { v: 4, t: 2 }];
    expect(kinematicsState(segs, 2).distance).toBeCloseTo(20, 9);
    expect(kinematicsState(segs, 6.5)).toMatchObject({ distance: 50, speed: 0, segment: 1 });
    expect(kinematicsState(segs, 9).distance).toBeCloseTo(54, 9);
    expect(kinematicsState(segs, 99)).toMatchObject({ distance: 58, totalTime: 10, totalDistance: 58 });
    expect(distanceTimePoints(segs)).toEqual([[0, 0], [5, 50], [8, 50], [10, 58]]);
    expect(markerSpacing(100, 10)).toEqual({ spacing: 10, count: 10 });
    expect(markerSpacing(1000, 10)).toEqual({ spacing: 30, count: 33 });
  });
  it('parts', () => {
    expectParts(build('kinematics', { radar: true }), ['Car', 'Road', 'Marker_0', 'Marker_10', 'Radar', 'Stopwatch', 'Graph_Axes', 'Graph_Line', 'Graph_Point', 'Arrow_Velocity']);
    expect(names(build('kinematics', { showGraph: false }))).not.toContain('Graph_Line');
    expect(names(build('kinematics', {}, { graph: false }))).not.toContain('Graph_Axes');
  });
});

describe('forces', () => {
  const st = (params: Record<string, unknown>) => forcesState(parseForcesParams(params));
  it('defaults', () => expect(parseForcesParams(null)).toEqual(DEFAULT_FORCES));
  it('gravity and normal cancel; resultant is the vector sum', () => {
    const s = st({ mass: 2, forces: [{ id: 'F1', magnitude: 3, angleDeg: 0 }, { id: 'F2', magnitude: 4, angleDeg: 90 }] });
    expect(s.weight).toBeCloseTo(19.62, 9);
    expect(s.normal).toBeCloseTo(15.62, 9);
    expect(s.resultant[0]).toBeCloseTo(3, 9);
    expect(s.resultant[1]).toBeCloseTo(0, 9);
    expect(s.acceleration[0]).toBeCloseTo(1.5, 9);
  });
  it('friction: static holds up to μN, kinetic opposes motion', () => {
    const held = st({ mass: 1, friction: 0.5, forces: [{ id: 'F', magnitude: 4, angleDeg: 0 }] });
    expect(held.held).toBe(true);
    expect(held.friction).toBeCloseTo(-4, 9);
    expect(held.resultant).toEqual([0, 0]);
    const slides = st({ mass: 1, friction: 0.5, forces: [{ id: 'F', magnitude: 10, angleDeg: 180 }] });
    expect(slides.held).toBe(false);
    expect(slides.friction).toBeCloseTo(0.5 * 9.81, 9);
    expect(slides.resultant[0]).toBeCloseTo(-10 + 4.905, 9);
  });
  it('lift-off: no normal, no friction', () => {
    const s = st({ mass: 1, friction: 0.3, forces: [{ id: 'up', magnitude: 20, angleDeg: 90 }] });
    expect(s.lifted).toBe(true);
    expect(s.normal).toBe(0);
    expect(s.resultant[1]).toBeCloseTo(20 - 9.81, 9);
    expect(forcesMotion(s).arrival).toBeGreaterThan(0);
  });
  it('parts', () => {
    expectParts(build('forces', { forces: [{ id: 'push', magnitude: 5, angleDeg: 0 }], friction: 0.2, dynamometer: true }), ['Block', 'Table', 'Arrow_push', 'Arrow_Gravity', 'Arrow_Normal', 'Arrow_Friction', 'Arrow_Resultant', 'Dynamometer', 'Spring']);
    expect(names(build('forces', { gravity: false }))).not.toContain('Arrow_Gravity');
  });
});

describe('lever', () => {
  it('defaults: pivot at the middle', () => {
    expect(parseLeverParams({ length: 3 })).toMatchObject({ length: 3, pivot: 1.5, loads: [], g: 9.81 });
  });
  it('moments Σ m·g·(x − pivot), balance and tilt sign', () => {
    const bal = leverState(parseLeverParams({ length: 2, pivot: 1, loads: [{ id: 'a', position: 0, mass: 2 }, { id: 'b', position: 1.5, mass: 4 }] }));
    expect(bal.loads[0].moment).toBeCloseTo(-19.62, 9);
    expect(bal.loads[1].moment).toBeCloseTo(19.62, 9);
    expect(bal.balanced).toBe(true);
    expect(leverTilt(bal, 0.2)).toBe(0);
    const right = leverState(parseLeverParams({ length: 2, loads: [{ id: 'a', position: 0, mass: 1 }, { id: 'b', position: 2, mass: 3 }] }));
    expect(right.netMoment).toBeCloseTo(2 * 9.81, 9);
    expect(leverTilt(right, 0.2)).toBeLessThan(0); // right end down
    const left = leverState(parseLeverParams({ length: 2, loads: [{ id: 'a', position: 0, mass: 3 }] }));
    expect(leverTilt(left, 0.2)).toBeGreaterThan(0);
  });
  it('parts', () => {
    expectParts(build('lever', { loads: [{ id: 'x', position: 0.4, mass: 1 }] }), ['Beam', 'Pivot', 'Load_x', 'Arm_x', 'Arrow_x']);
  });
});

describe('particles', () => {
  it('defaults and lenient parsing', () => {
    expect(parseParticlesParams({})).toEqual(DEFAULT_PARTICLES);
    const p = parseParticlesParams({ species: [{ id: 'w', count: 50 }, { id: 's', count: 20, place: 'clump', element: 'Na' }, { id: 'bad', count: 'x' }], bonded: [{ a: 'w', b: 'zz' }], dissolve: 2 });
    expect(p.species.map((s) => s.id)).toEqual(['w', 's']);
    expect(p.bonded).toEqual([]);
    expect(p.dissolve).toBe(0);
  });
  it('solvent, dissolving, thermal speed', () => {
    const p = parseParticlesParams({ species: [{ id: 'water', count: 60 }, { id: 'ink', count: 10 }, { id: 'salt', count: 20, place: 'clump' }], dissolve: 0.5 });
    expect(solventOf(p.species)).toBe('water');
    expect(dissolvedCount(p.species[2], 0.5)).toBe(10);
    expect(thermalSpeed(20)).toBeCloseTo(1, 9);
    expect(thermalSpeed(100)).toBeGreaterThan(thermalSpeed(20));
  });
  it('parts in particle and macro views', () => {
    const params = { species: [{ id: 'water', count: 60, hue: 200 }, { id: 'oil', count: 20, place: 'top' }, { id: 'h', count: 4, element: 'H' }, { id: 'o', count: 2, element: 'O' }], bonded: [{ a: 'o', b: 'h' }] };
    expectParts(build('particles', params, { zoom: false }), ['Container', 'Solvent', 'Species_water', 'Species_oil', 'Species_h', 'Species_o']);
    expectParts(build('particles', params, { zoom: true }), ['Container', 'Solvent', 'Species_water', 'Species_oil']);
  });
});

describe('separation', () => {
  it('defaults', () => expect(parseSeparationParams({ method: 'boiling' })).toEqual({ method: 'filtration' }));
  it('the optional «method» mode group switches the apparatus; its default follows the param', () => {
    const defs = simPlugin.modes({ plugin: 'sim', params: { model: 'separation', method: 'magnet' }, modes: [] } as never);
    expect(defaultModeState(defs).method).toBe('magnet');
    expectParts(build('separation', { method: 'filtration' }, { method: 'distillation' } as never), [...SEPARATION_PARTS.distillation]);
    expect(names(build('separation', { method: 'filtration' }, { method: 'nope' } as never))).toContain('Funnel');
  });
  it('every method draws its contract parts', () => {
    for (const method of METHODS) expectParts(build('separation', { method, mixture: 'x' }), [...SEPARATION_PARTS[method]]);
  });
});

describe('reaction-vessel', () => {
  it('defaults and lenient compare', () => {
    expect(parseReactionParams({ metal: 'Pb', compare: ['Na', 'Na', 'Zn', 'Pb', 'K'] })).toEqual({ metal: 'Zn', reagent: 'acid', compare: ['Na', 'K'] });
  });
  it('rates are monotone down the series for every reagent', () => {
    for (const r of REAGENTS) {
      for (let i = 1; i < SERIES.length; i++) expect(reactionRate(SERIES[i], r), `${r} ${SERIES[i]}`).toBeLessThanOrEqual(reactionRate(SERIES[i - 1], r));
    }
  });
  it('water, steam, acid and oxygen rules', () => {
    expect(SERIES.filter((m) => reactionRate(m, 'water') >= 0.3)).toEqual(['K', 'Na', 'Ca']);
    expect(reactionRate('Mg', 'water')).toBeGreaterThan(0);
    expect(reactionRate('Mg', 'water')).toBeLessThan(0.1);
    for (const m of ['Mg', 'Zn', 'Fe'] as const) expect(reactionRate(m, 'steam')).toBeGreaterThan(0);
    SERIES.forEach((m, i) => expect(reactionRate(m, 'acid') > 0, m).toBe(i < H_INDEX));
    expect(reactionRate('Cu', 'oxygen')).toBeGreaterThan(0);
    expect(reactionRate('Ag', 'oxygen')).toBe(0);
    expect(reactionRate('Au', 'oxygen')).toBe(0);
    expect(formsBase('Na', 'water')).toBe(true);
    expect(formsBase('Zn', 'acid')).toBe(false);
    expect(equation('Zn', 'acid')).toBe('Zn + 2HCl → ZnCl₂ + H₂↑');
    expect(equation('Cu', 'acid', 'en')).toContain('no reaction');
  });
  it('parts, compare left→right', () => {
    const parts = build('reaction-vessel', { metal: 'Mg', reagent: 'acid', compare: ['K', 'Ag'] });
    expectParts(parts, ['Vessel', 'Metal', 'Metal_Mg', 'Metal_K', 'Metal_Ag', 'Liquid', 'Bubbles', 'Flame', 'Product', 'Indicator']);
    const x = (n: string) => parts.find((p) => p.name === n)!.position![0];
    expect(x('Vessel')).toBeLessThan(x('Vessel_K'));
    expect(x('Vessel_K')).toBeLessThan(x('Vessel_Ag'));
    for (const r of REAGENTS) expectParts(build('reaction-vessel', { metal: 'Na', reagent: r }), ['Vessel', 'Metal', 'Liquid', 'Bubbles', 'Flame', 'Product', 'Indicator']);
  });
});

describe('energy-profile', () => {
  it('defaults by kind', () => {
    expect(parseEnergyProfileParams({})).toMatchObject({ kind: 'exo', reactants: 100, products: 40, activation: 60, startTemp: 20, deltaT: 25, compare: false });
    expect(parseEnergyProfileParams({ kind: 'endo' })).toMatchObject({ products: 160, deltaT: -10 });
  });
  it('ΔH = products − reactants; hump starts, peaks and ends at the levels', () => {
    const p = parseEnergyProfileParams({});
    expect(energyProfile(p)).toEqual({ deltaH: -60, peak: 160, activation: 60 });
    expect(humpEnergy(p, 0.1)).toBe(100);
    expect(humpEnergy(p, 0.5)).toBe(160);
    expect(humpEnergy(p, 0.9)).toBe(40);
    expect(energyProfile(parseEnergyProfileParams({ kind: 'endo' })).deltaH).toBe(60);
  });
  it('T(t) reaches start + ΔT, then relaxes to room temperature', () => {
    const p = parseEnergyProfileParams({ kind: 'endo' });
    expect(temperatureAt(p, 0)).toBe(20);
    expect(temperatureAt(p, REACT)).toBeCloseTo(10, 9);
    expect(temperatureAt(p, REACT + 20)).toBeGreaterThan(temperatureAt(p, REACT));
    expect(Math.abs(temperatureAt(p, RECORD) - 20)).toBeLessThan(1);
  });
  it('parts; compare by param or mode', () => {
    expectParts(build('energy-profile', {}), ['Axis_Energy', 'Axis_Progress', 'Level_Reactants', 'Level_Products', 'Hump', 'Arrow_DeltaH', 'Arrow_Activation', 'Beaker', 'Thermometer', 'Graph_Temperature', 'Hump_Endo']);
    expect(names(build('energy-profile', {}, { compare: false }))).not.toContain('Hump_Endo');
    expect(names(build('energy-profile', { compare: true }, { compare: false }))).toContain('Hump_Endo');
  });
});

describe('food-web', () => {
  const web = {
    organisms: [
      { id: 'grass', level: 'producer' }, { id: 'hare', level: 'primary', count: 10 }, { id: 'fox', level: 'secondary', count: 4 }, { id: 'eagle', level: 'tertiary', count: 2 },
    ],
    links: [['grass', 'hare'], ['hare', 'fox'], ['fox', 'eagle'], ['hare', 'eagle'], ['grass', 'nobody']],
    pollutant: { start: 0.01 },
  };
  it('lenient parsing and the default web', () => {
    const p = parseFoodWebParams(web);
    expect(p.links).toHaveLength(4);
    expect(p.pollutant).toEqual({ name: undefined, start: 0.01, factor: 10 });
    expect(parseFoodWebParams({ biome: 'forest' }).organisms.length).toBeGreaterThan(3);
  });
  it('icons: content words map to emoji, emoji pass through, else the initial', () => {
    for (const w of ['algae', 'bacteria', 'beaver', 'bird', 'bush', 'coyote', 'deer', 'eagle', 'fish', 'fox', 'grass', 'grasshopper', 'ibex', 'marmot', 'mouse', 'mushroom', 'plankton', 'snow-leopard', 'tree', 'wolf']) {
      expect(iconFor({ id: 'x', level: 'producer', icon: w }), w).toMatch(/[^\x00-\x7f]/);
    }
    expect(iconFor({ id: 'x', level: 'producer', icon: '🦔' })).toBe('🦔');
    expect(iconFor({ id: 'zebu', level: 'primary' })).toBe('Z');
  });
  it('10 % rule and pollutant ×factor per level', () => {
    expect([energyShare('producer'), energyShare('primary'), energyShare('secondary')]).toEqual([100, 10, 1.0000000000000002]);
    const c = pollutantLevels(parseFoodWebParams(web));
    expect(c.get('grass')).toBeCloseTo(0.1, 12);
    expect(c.get('hare')).toBeCloseTo(1, 12);
    expect(c.get('eagle')).toBeCloseTo(100, 9);
    expect(pollutantLevels(parseFoodWebParams({ ...web, pollutant: { start: 1, factor: 3 } })).get('fox')).toBeCloseTo(27, 9);
  });
  it('removal: counts react', () => {
    const k = reactedCounts(parseFoodWebParams({ ...web, removed: ['fox'] }));
    expect(k.get('fox')).toBe(0);
    expect(k.get('hare')).toBe(15); // one of two predators gone: ×1.5
    expect(k.get('eagle')).toBe(1); // half of its food gone
  });
  it('parts (removed stay drawn)', () => {
    expectParts(build('food-web', { ...web, removed: ['fox'] }), ['Sun', 'Organism_grass', 'Organism_fox', 'Link_hare_fox', 'Level_producer', 'Level_tertiary', 'Pollutant_eagle']);
    const fox = build('food-web', { ...web, removed: ['fox'] }).find((p) => p.name === 'Organism_fox')!;
    expect(fox.opacity).toBe(0.3);
    expect(fox.noPick).toBeFalsy();
  });
});

describe('nutrition-plate', () => {
  it('defaults and kcal', () => {
    expect(parseNutritionParams({}).foods).toEqual(DEFAULT_FOODS);
    expect(foodKcal({ id: 'b', group: 'fats', grams: 10 })).toBe(80);
    expect(foodKcal({ id: 'b', group: 'fats', grams: 10, kcal: 72 })).toBe(72);
  });
  it('summary against the target', () => {
    const p = parseNutritionParams({ foods: [{ id: 'bread', group: 'carbs', grams: 100, kcal: 250 }, { id: 'egg', group: 'proteins', grams: 50, kcal: 75 }, { id: 'oil', group: 'fats', grams: 10, kcal: 90 }, { id: 'apple', group: 'vitamins', grams: 150, kcal: 85 }], target: { kcal: 2000, carbs: 55, proteins: 15, fats: 30 } });
    const s = nutritionSummary(p);
    expect(s.totalKcal).toBe(500);
    expect(s.shares).toEqual({ carbs: 67, proteins: 15, fats: 18 });
    expect(s.targetKcal).toEqual({ carbs: 1100, proteins: 300, fats: 600 });
  });
  it('food tests', () => {
    expect(testResult('carbs', 'iodine').positive).toBe(true);
    expect(testResult('proteins', 'iodine').positive).toBe(false);
    expect(testResult('proteins', 'biuret').positive).toBe(true);
    expect(testResult('fats', 'paper').positive).toBe(true);
  });
  it('parts; the test runs on the selected food', () => {
    const params = { target: { kcal: 600, carbs: 55, proteins: 15, fats: 30 }, test: 'iodine' };
    expectParts(build('nutrition-plate', params), ['Plate', 'Food_rice', 'Food_water', 'Sector_carbs', 'Sector_water', 'Bar_carbs', 'Scale', 'Test_rice', 'Test_chicken']);
    const sel = build('nutrition-plate', params, {}, { selected: new Set(['Food_rice']) });
    expect(names(sel)).toContain('Test_rice');
    expect(names(sel)).not.toContain('Test_chicken');
  });
});

describe('dev mock packages (src/mocks/content/packages/sim-*.json)', () => {
  it('validate, use their model and bind every concept', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { validatePackage, topicConcepts } = await import('@bilig/content-model');
    const { unboundConcepts } = await import('@bilig/scene-kit');
    const dir = fileURLToPath(new URL('../../../../src/mocks/content/packages/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.startsWith('sim-'));
    expect(files.length).toBe(NEW.length);
    for (const f of files) {
      const res = validatePackage(JSON.parse(readFileSync(dir + f, 'utf8')));
      expect(res.issues.filter((i) => i.severity === 'error'), f).toEqual([]);
      const pkg = res.data!;
      const scene = pkg.topic.scene;
      const model = MODELS[(scene.params as { model: keyof typeof MODELS }).model];
      const modes = Object.fromEntries(scene.modes.map((m) => [m, true]));
      expect(unboundConcepts(model.build(scene.params ?? {}, { modes }), topicConcepts(pkg)), f).toEqual([]);
    }
  });
});
