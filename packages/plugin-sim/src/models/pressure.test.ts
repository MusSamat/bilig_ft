import { describe, it, expect } from 'vitest';
import { defaultModeState, resolveModes, type ModeState } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';
import {
  DEFAULT_PRESSURE, barometerMm, barometerState, faceDims, hydraulicState, liquidPressure, num, parsePressureParams, pascalHoles, pressure, solidState, vesselJets,
} from './pressure.js';

const allOn = (raw: Record<string, unknown>) => Object.fromEntries((pressure.modesFor?.(raw) ?? pressure.modes).map((d) => [d.id, true]));
const build = (raw: Record<string, unknown>, modes: ModeState = allOn(raw), lang: 'ky' | 'ru' | 'en' = 'ru') => pressure.build(raw, { modes, lang });
const names = (parts: Part[]) => new Set(parts.map((p) => p.name));
const textOf = (parts: Part[], name: string) => {
  const p = parts.find((x) => x.name === name);
  return p && p.shape.kind === 'text' ? p.shape.text : '';
};
const VARIANTS = ['solid', 'liquid', 'pascal', 'hydraulic', 'barometer'] as const;

describe('pressure: params', () => {
  it('defaults and lenient parsing', () => {
    expect(parsePressureParams(undefined)).toEqual(DEFAULT_PRESSURE);
    expect(parsePressureParams({ variant: 'x', size: [1, 'a', 2], mass: -1, face: 'top', liquid: 'milk', depth: 'deep', g: 0 })).toEqual(DEFAULT_PRESSURE);
    // Brick sides are sorted a ≥ b ≥ c; depth never below the liquid column.
    expect(parsePressureParams({ size: [0.065, 0.25, 0.12] }).size).toEqual([0.25, 0.12, 0.065]);
    expect(parsePressureParams({ variant: 'liquid', depth: 0.9, height: 0.4 }).depth).toBe(0.4);
  });
  it('numbers are formatted per language', () => {
    expect(num(816.666, 'ru')).toBe('817');
    expect(num(24.5, 'ru')).toBe('24,5');
    expect(num(0.03, 'en')).toBe('0.03');
    expect(num(101292.8, 'ru', 4)).toBe('101 293');
    expect(num(13600, 'en', 5)).toBe('13 600');
  });
});

describe('pressure: physics', () => {
  it('solid: same F, p = F/S grows as the face gets smaller, dent follows p', () => {
    const p = parsePressureParams({});
    expect(faceDims(p.size, 'end')).toEqual({ fx: 0.12, fz: 0.065, h: 0.25 });
    const [large, side, end] = (['large', 'side', 'end'] as const).map((f) => solidState(p, f));
    expect(large.weight).toBeCloseTo(24.5);
    expect(large.area).toBeCloseTo(0.03);
    expect(large.pressure).toBeCloseTo(816.67, 1);
    expect(side.pressure).toBeCloseTo(24.5 / (0.25 * 0.065), 3);
    expect(end.pressure).toBeCloseTo(24.5 / (0.12 * 0.065), 3);
    expect(large.dent).toBeLessThan(side.dent);
    expect(side.dent).toBeLessThan(end.dent);
    expect(solidState({ ...p, surface: 'foam' }).dent).toBeGreaterThan(large.dent);
  });
  it('liquid: p = ρgh; Torricelli jets faster deeper, same for every liquid', () => {
    expect(liquidPressure(1000, 9.8, 0.3)).toBeCloseTo(2940);
    const w = vesselJets(parsePressureParams({ variant: 'liquid' }));
    const m = vesselJets(parsePressureParams({ variant: 'liquid', liquid: 'mercury' }));
    expect(w.map((j) => j.depth)).toEqual([0.125, 0.25, 0.375]);
    expect(w[0].speed).toBeLessThan(w[2].speed);
    expect(m[2].speed).toBeCloseTo(w[2].speed);
    expect(m[2].pressure / w[2].pressure).toBeCloseTo(13.6);
  });
  it('hydraulic: F₂ = F₁·S₂/S₁, volume kept', () => {
    const s = hydraulicState(parsePressureParams({ variant: 'hydraulic' }));
    expect(s.pressure).toBeCloseTo(100000);
    expect(s.force2).toBeCloseTo(5000);
    expect(s.gain).toBeCloseTo(50);
    expect(s.s2).toBeCloseTo(0.003);
    expect(s.loadMass).toBeCloseTo(510.2, 1);
  });
  it('barometer: 760 mm at sea level, ≈ 1 mm less per 12 m, p ≈ 101 kPa', () => {
    expect(barometerMm(0)).toBe(760);
    expect(barometerMm(12)).toBeCloseTo(759, 1);
    expect(barometerMm(120)).toBeCloseTo(750, 0);
    expect(barometerMm(3000)).toBeLessThan(560);
    expect(barometerState(parsePressureParams({ variant: 'barometer' })).pressure).toBeCloseTo(13600 * 9.8 * 0.76, 3);
  });
  it('pascal: holes all round the ball, none into the neck', () => {
    const h = pascalHoles();
    expect(h.length).toBeGreaterThan(8);
    for (const d of h) {
      expect(Math.hypot(...d)).toBeCloseTo(1);
      expect(d[0]).toBeGreaterThan(-0.45);
    }
  });
});

describe('pressure: parts', () => {
  it('contract part names per variant', () => {
    const expected: Record<(typeof VARIANTS)[number], string[]> = {
      solid: ['Brick', 'Surface', 'Dent', 'Arrow_Force', 'Contact', 'Readout'],
      liquid: ['Vessel', 'Liquid', 'Probe', 'Gauge', 'Jet_1', 'Jet_2', 'Jet_3', 'Depth', 'Readout'],
      pascal: ['Ball', 'Piston', 'Cylinder', 'Liquid', 'Jet_1', 'Jet_8', 'Arrow_Force', 'Readout'],
      hydraulic: ['Piston_Small', 'Piston_Large', 'Load', 'Arrow_F1', 'Arrow_F2', 'Cylinder_Small', 'Cylinder_Large', 'Readout'],
      barometer: ['Tube', 'Mercury', 'Vacuum', 'Dish', 'Scale', 'Arrow_Air', 'Readout'],
    };
    for (const v of VARIANTS) {
      const n = names(build({ variant: v }));
      for (const e of expected[v]) expect(n, `${v}: ${e}`).toContain(e);
    }
  });
  it('solid compare mode shows all three faces', () => {
    const n = names(build({ variant: 'solid', face: 'side' }));
    for (const e of ['Brick', 'Brick_Large', 'Brick_End', 'Dent_Large', 'Contact_End', 'Arrow_Force_End']) expect(n).toContain(e);
    expect(pressure.modesFor?.({ variant: 'liquid' }).map((m) => m.id)).not.toContain('compare');
  });
  it('readouts in the scene language', () => {
    expect(textOf(build({ variant: 'solid' }, { vectors: true }), 'Readout')).toContain('p = F/S = 817 Па');
    expect(textOf(build({ variant: 'liquid' }, {}, 'en'), 'Readout')).toContain('= 2940 Pa');
    expect(textOf(build({ variant: 'barometer' }, {}, 'ky'), 'Readout')).toContain('760 сым. мам. мм');
    expect(textOf(build({ variant: 'barometer' }, {}, 'ru'), 'Readout')).toContain('101 293 Па');
    expect(textOf(build({ variant: 'hydraulic' }, {}, 'ru'), 'Readout')).toContain('F₂ = p·S₂ = 5000 Н');
    expect(textOf(build({ variant: 'pascal' }, {}, 'ky'), 'Readout')).toContain('Паскаль');
  });
  it('vectors mode adds the arrows', () => {
    expect(names(build({ variant: 'hydraulic' }, {}))).not.toContain('Arrow_F1');
    expect(names(build({ variant: 'barometer' }, { vectors: true }))).toContain('Arrow_Air_1');
  });
  it('robust: unique names, parents exist, motions finite, part counts modest', () => {
    for (const v of VARIANTS) {
      for (const raw of [{ variant: v }, { variant: v, liquid: 'mercury', depth: 0, height: 1, face: 'end', surface: 'foam', smallArea: 0.05, largeArea: 0.001, altitude: 9000, force: 0 }]) {
        for (const modes of [allOn(raw), defaultModeState(resolveModes(pressure.modesFor?.(raw) ?? pressure.modes, []))]) {
          const parts = build(raw, modes);
          expect(parts.length).toBeLessThan(400);
          expect(new Set(parts.map((p) => p.name)).size, `${v} unique`).toBe(parts.length);
          const n = names(parts);
          for (const p of parts) if (p.parent) expect(n, `${v}: parent of ${p.name}`).toContain(p.parent);
          for (const t of [0, 0.4, 1.3, 3, 7.7, 60]) {
            const c = pressure.clock(raw, undefined, t);
            expect(Number.isFinite(c)).toBe(true);
            for (const p of parts) {
              const r = p.motion?.(c);
              for (const x of [r?.position, r?.scale, r?.rotation]) if (x) expect(x.every(Number.isFinite), `${v} ${p.name}`).toBe(true);
              if (p.instanceMotion) expect(p.instanceMotion(c, 1).every(Number.isFinite)).toBe(true);
            }
          }
        }
      }
    }
  });
  it('animations settle: dent depth, gauge and mercury column reach their values', () => {
    const solid = build({ variant: 'solid' });
    const brick = solid.find((p) => p.name === 'Brick')!;
    const K = 5;
    const s = solidState(parsePressureParams({}));
    expect(brick.motion!(10).position![1] / K).toBeCloseTo(s.dims.h / 2 - s.dent, 5);
    const baro = build({ variant: 'barometer' });
    const merc = baro.find((p) => p.name === 'Level_Marker')!;
    const y0 = merc.motion!(0).position![1];
    const y1 = merc.motion!(30).position![1];
    expect(y0).toBeGreaterThan(y1);
    expect(y1 / 2.4 - 0.046).toBeCloseTo(0.76, 4);
    const liq = build({ variant: 'liquid' });
    const L = liq.find((p) => p.name === 'Gauge_Fluid_L')!;
    const R = liq.find((p) => p.name === 'Gauge_Fluid_R')!;
    const dh = (R.motion!(30).scale![1] - L.motion!(30).scale![1]);
    expect(dh).toBeCloseTo(0.3, 4);
  });
  it('hydraulic clock loops; with a process it follows the fraction', () => {
    expect(pressure.clock({ variant: 'hydraulic' }, undefined, 5.5 + 1)).toBeCloseTo(1);
    expect(pressure.clock({ variant: 'hydraulic' }, { time: 0, fraction: 1, stepIndex: 0, stepFraction: 1 }, 0)).toBe(3);
  });
});
