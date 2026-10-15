import { describe, it, expect } from 'vitest';
import type { Process } from '@bilig/content-model';
import { L } from '@bilig/content-model';
import { engineReadouts, equationSides, odeReadouts, oscillator, readoutFraction, stoichReadouts, timelineReadouts } from './engines.js';
import { PluginRegistry } from './index.js';
import * as player from './player.js';

const proc = (over: Partial<Process> = {}): Process => ({
  key: 'p',
  engine: 'timeline',
  title: L('p'),
  icon: 'wind',
  description: L('d'),
  inputs: L('in'),
  outputs: L('out'),
  steps: [
    { key: 'a', title: L('a'), description: L('a'), altText: L('a'), duration: 2 },
    { key: 'b', title: L('b'), description: L('b'), altText: L('b'), duration: 2 },
  ],
  metrics: [{ key: 'atp', label: L('ATP'), min: 0, max: 30, precision: 0 }],
  ...over,
});

const viewAt = (p: Process, fraction: number) =>
  player.playerView(player.seek(player.createPlayer(p.steps), fraction));

describe('timeline engine', () => {
  it('uses per-step cumulative targets from params', () => {
    const p = proc({
      params: { 'atp@a': 2, 'atp@b': 30 },
      metrics: [{ key: 'atp', label: L('ATP'), min: 0, max: 30, precision: 2 }],
    });
    expect(timelineReadouts(p, viewAt(p, 0))[0].value).toBe(0);
    expect(timelineReadouts(p, viewAt(p, 0.5))[0].value).toBe(2);
    expect(timelineReadouts(p, viewAt(p, 1))[0].value).toBe(30);
    // eased, not a straight line inside the step
    const quarter = timelineReadouts(p, viewAt(p, 0.125))[0].value as number;
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(0.5);
  });
  it('without params distributes min→max over durations and stays monotonic', () => {
    const p = proc();
    const values = [0, 0.25, 0.5, 0.75, 1].map((f) => timelineReadouts(p, viewAt(p, f))[0].value as number);
    expect(values[0]).toBe(0);
    expect(values[4]).toBe(30);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });
});

describe('stoich engine', () => {
  it('n = n0 + nu * xi', () => {
    const p = proc({
      engine: 'stoich',
      params: { 'n0.atp': 6, 'nu.atp': -6 },
    });
    expect(stoichReadouts(p, { fraction: 0 })[0].value).toBe(6);
    expect(stoichReadouts(p, { fraction: 0.5 })[0].value).toBe(3);
    expect(stoichReadouts(p, { fraction: 1 })[0].value).toBe(0);
  });
});

describe('stoich engine — content form (species + molar masses + equation)', () => {
  const water = proc({
    engine: 'stoich',
    equation: '2H_2O \\to 2H_2 + O_2',
    params: { H2O: 2, H2: 2, O2: 1, M_H2O: 18.02, M_H2: 2.016, M_O2: 32, dH_kJ: 572 },
    metrics: [
      { key: 'h2o', label: L('H2O'), unit: 'g', min: 0, max: 36, precision: 2 },
      { key: 'h2', label: L('H2'), unit: 'g', min: 0, max: 4, precision: 3 },
      { key: 'o2', label: L('O2'), unit: 'g', min: 0, max: 32, precision: 2 },
      { key: 'heat', label: L('Q'), unit: 'kJ', precision: 0 },
    ],
  });
  it('reactants are consumed and products formed with mass conservation', () => {
    const start = stoichReadouts(water, { fraction: 0 }).map((r) => r.value);
    const end = stoichReadouts(water, { fraction: 1 }).map((r) => r.value as number);
    expect(start).toEqual([36.04, 0, 0, 0]);
    expect(end[0]).toBe(0);
    expect(end[1]).toBeCloseTo(4.032, 3);
    expect(end[2]).toBe(32);
    expect(end[3]).toBe(572);
    expect(end[1] + end[2]).toBeCloseTo(36.04, 1);
  });
  it('parses equation sides', () => {
    expect(equationSides('CH_4 + 2O_2 \\to CO_2 + 2H_2O')).toEqual({ left: ['CH4', 'O2'], right: ['CO2', 'H2O'] });
  });
});

describe('ode engine', () => {
  it('conserves energy without damping', () => {
    const p = proc({
      engine: 'ode',
      params: { omega: 2, x0: 1, mass: 1 },
      metrics: [
        { key: 'energy', label: L('E'), precision: 6 },
        { key: 'x', label: L('x'), precision: 6 },
      ],
    });
    const e0 = odeReadouts(p, { time: 0 })[0].value as number;
    const e1 = odeReadouts(p, { time: 1.37 })[0].value as number;
    expect(e0).toBeCloseTo(2, 6);
    expect(e1).toBeCloseTo(e0, 5);
    expect(odeReadouts(p, { time: Math.PI / 2 })[1].value as number).toBeCloseTo(-1, 5);
  });
  it('damping decays the amplitude', () => {
    expect(Math.abs(oscillator(10, 2, 0.2, 1, 0).x)).toBeLessThan(0.05);
    expect(oscillator(1, 1, 2, 1, 0).x).toBeGreaterThan(0);
  });
});

describe('engineReadouts / registry', () => {
  it('dispatches on engine and falls back from plugins', () => {
    const p = proc();
    const view = viewAt(p, 1);
    expect(engineReadouts(p, view)[0].value).toBe(30);
    const reg = new PluginRegistry();
    const scene = { plugin: 'x', params: {}, modes: [] };
    expect(reg.readoutsFor(scene, p, view)[0].value).toBe(30);
    reg.register({ type: 'x', modes: () => [], Component: () => null, readouts: () => [{ key: 'k', label: L('k'), value: 7 }] });
    expect(reg.readoutsFor(scene, p, view)[0].value).toBe(7);
  });
  it('readoutFraction maps into the bar range', () => {
    expect(readoutFraction({ key: 'a', label: L('a'), value: 15, min: 0, max: 30 })).toBe(0.5);
    expect(readoutFraction({ key: 'a', label: L('a'), value: 'x' })).toBe(0);
    expect(readoutFraction({ key: 'a', label: L('a'), value: 99, min: 0, max: 30 })).toBe(1);
  });
});
