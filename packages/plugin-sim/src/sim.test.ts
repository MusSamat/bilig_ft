import { describe, it, expect } from 'vitest';
import type { Process } from '@bilig/content-model';
import { L } from '@bilig/content-model';
import { defaultModeState, resolveModes, player } from '@bilig/scene-core';
import { unboundConcepts } from '@bilig/scene-kit';
import { realTopics } from '../../scene-kit/src/real-packages.test-util.js';
import {
  DEFAULT_PENDULUM, circuitState, eccentricAnomaly, inclineState, moonState, orbitState,
  parseCircuitParams, parseInclineParams, parsePendulumParams, pendulumState, seasonState,
} from './physics.js';
import { processModel, simReadouts } from './readouts.js';
import { MODELS, circuitLoop } from './models.js';
import { simPlugin } from './index.js';

const P = { ...DEFAULT_PENDULUM, length: 2, amplitudeDeg: 20, mass: 0.5 };

describe('pendulum', () => {
  it('period, energy conservation, speed extremes', () => {
    const T = pendulumState(P, 0).period;
    expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt(2 / 9.81), 9);
    const e0 = pendulumState(P, 0).energy;
    for (const t of [0.1, 0.37, 1, 2.5]) expect(pendulumState(P, t).energy).toBeCloseTo(e0, 9);
    expect(pendulumState(P, 0).speed).toBeCloseTo(0, 9);
    const bottom = pendulumState(P, T / 4);
    expect(bottom.height).toBeCloseTo(0, 9);
    expect(bottom.speed).toBeCloseTo(Math.sqrt(2 * 9.81 * 2 * (1 - Math.cos((20 * Math.PI) / 180))), 9);
  });
  it('damping and lenient parsing (amplitudeDeg or legacy theta0)', () => {
    const d = { ...P, damping: 0.5 };
    expect(pendulumState(d, 5).energy).toBeLessThan(pendulumState(d, 0).energy);
    expect(parsePendulumParams({ length: -1, theta0: 45 })).toEqual({ ...DEFAULT_PENDULUM, amplitudeDeg: 45 });
    expect(parsePendulumParams({ amplitudeDeg: 10, theta0: 45 }).amplitudeDeg).toBe(10);
  });
});

describe('inclined plane', () => {
  const p = parseInclineParams({ angleDeg: 30, mass: 2, mu: 0.2, g: 9.81, length: 3 });
  it('a = g(sin θ − μ cos θ), s = ½at², clamped at the length', () => {
    const a = 9.81 * (Math.sin(Math.PI / 6) - 0.2 * Math.cos(Math.PI / 6));
    const s = inclineState(p, 1);
    expect(s.acceleration).toBeCloseTo(a, 9);
    expect(s.distance).toBeCloseTo(a / 2, 9);
    expect(s.speed).toBeCloseTo(a, 9);
    expect(inclineState(p, 99).distance).toBeCloseTo(3, 9);
    expect(inclineState(p, 99).time).toBeCloseTo(Math.sqrt(6 / a), 9);
  });
  it('friction holds the block when μ ≥ tan θ', () => {
    const s = inclineState(parseInclineParams({ angleDeg: 10, mu: 0.5 }), 3);
    expect(s.acceleration).toBe(0);
    expect(s.distance).toBe(0);
  });
});

describe('circuit, orbit, moon, seasons', () => {
  it('I = U/R and P = UI', () => {
    const c = circuitState(parseCircuitParams({ emf: 4.5, lampResistance: 9 }), 1);
    expect(c).toEqual({ current: 0.5, voltage: 4.5, power: 2.25 });
    expect(circuitState(parseCircuitParams({}), 0).current).toBe(0);
  });
  it('Kepler: period of 1 AU ≈ 365.25 d; perihelion faster than aphelion', () => {
    const o = { gm: 132712440018, semiMajorAxisAu: 1, eccentricity: 0.0167, auKm: 149597871 };
    expect(orbitState(o, 0).periodDays).toBeCloseTo(365.25, 0);
    expect(orbitState(o, 0).distanceAu).toBeCloseTo(0.9833, 4);
    expect(orbitState(o, 0.5).distanceAu).toBeCloseTo(1.0167, 4);
    expect(orbitState(o, 0).speedKmS).toBeGreaterThan(orbitState(o, 0.5).speedKmS);
    const E = eccentricAnomaly(1, 0.5);
    expect(E - 0.5 * Math.sin(E)).toBeCloseTo(1, 12);
  });
  it('moon illumination and elongation', () => {
    expect(moonState(29.53, 0).illuminated).toBeCloseTo(0, 9);
    expect(moonState(29.53, 29.53 / 2)).toMatchObject({ elongation: 180 });
    expect(moonState(29.53, 29.53 / 2).illuminated).toBeCloseTo(100, 9);
    expect(moonState(29.53, 29.53 / 4).illuminated).toBeCloseTo(50, 9);
  });
  it('seasons at 42.9° N', () => {
    expect(seasonState(42.9, 23.44, 0.0167, 0).dayLength).toBeCloseTo(12, 6);
    expect(seasonState(42.9, 23.44, 0.0167, 0.25).noonAltitude).toBeCloseTo(70.54, 2);
    expect(seasonState(42.9, 23.44, 0.0167, 0.75).noonAltitude).toBeCloseTo(23.66, 2);
    expect(seasonState(42.9, 23.44, 0.0167, 0.25).dayLength).toBeGreaterThan(15);
  });
  it('circuit loop from wire names', () => {
    expect(circuitLoop(['battery-switch', 'bad', 'lamp-battery'])).toEqual([
      { name: 'battery-switch', from: 'battery', to: 'switch' },
      { name: 'lamp-battery', from: 'lamp', to: 'battery' },
    ]);
  });
});

const proc = (over: Partial<Process>): Process => ({
  key: 'p', engine: 'ode', title: L('p'), icon: 'activity', description: L('d'), inputs: L('i'), outputs: L('o'),
  steps: [{ key: 's', title: L('s'), description: L('s'), altText: L('s') }],
  metrics: [{ key: 'speed', label: L('v'), precision: 3 }, { key: 'unknown', label: L('u') }],
  params: { length: 1, amplitudeDeg: 30, mass: 1 },
  ...over,
});
const view = { time: 0, fraction: 0, stepIndex: 0, stepFraction: 0 };

describe('simReadouts', () => {
  it('returns only computable metric keys, [] for non-sim processes', () => {
    expect(simReadouts(proc({}), view).map((r) => r.key)).toEqual(['speed']);
    expect(simReadouts(proc({ params: { omega: 2 } }), view)).toEqual([]);
    expect(processModel({ emf: 1, resistance: 2 })).toBe('dc-circuit');
  });
});

describe('real content packages', () => {
  const topics = realTopics('sim');
  it.skipIf(!topics.length)('every sim topic: modes from the model, all node-bound concepts bound', () => {
    for (const { file, pkg, concepts } of topics) {
      const scene = pkg.topic.scene;
      const defs = resolveModes(simPlugin.modes(scene), scene.modes);
      const ids = defs.map((d) => d.id);
      for (const m of scene.modes) expect(ids, `${file} mode ${m}`).toContain(m);
      // all toggles on, so optional parts (vectors, traces) exist too
      const modes = { ...defaultModeState(defs), ...Object.fromEntries(scene.modes.map((m) => [m, true])) };
      const model = MODELS[(scene.params as { model: keyof typeof MODELS }).model];
      expect(model, file).toBeDefined();
      const parts = model.build(scene.params ?? {}, { modes, playback: { time: 1, fraction: 0.3, stepIndex: 2, stepFraction: 0.5 } });
      expect(unboundConcepts(parts, concepts), file).toEqual([]);
      for (const part of parts) part.motion?.(0.7);
    }
  });
  it.skipIf(!topics.length)('every sim process yields exactly its metric keys', () => {
    for (const { file, pkg } of topics) {
      for (const pr of pkg.processes) {
        const pl = player.createPlayer(pr.steps);
        for (const f of [0, 0.37, 1]) {
          const r = simPlugin.readouts!(pr, player.playerView(player.seek(pl, f)));
          expect(r.map((x) => x.key), `${file} ${pr.key}`).toEqual(pr.metrics.map((m) => m.key));
          for (const x of r) expect(Number.isFinite(x.value as number), `${pr.key}.${x.key}`).toBe(true);
        }
      }
    }
  });
});
