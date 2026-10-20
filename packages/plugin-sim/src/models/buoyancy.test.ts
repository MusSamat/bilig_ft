import { describe, it, expect } from 'vitest';
import { defaultModeState, resolveModes, type ModeState } from '@bilig/scene-core';
import type { Part } from '@bilig/scene-kit';
import {
  DEFAULT_BODIES, DEFAULT_BUOYANCY, MATERIALS, balloonState, bodyGeom, buoyancy, buoyantForce, compareItems, dynamometerState, fateOf, floatPath, niceCeil,
  parseBuoyancyParams,
} from './buoyancy.js';

const allOn = Object.fromEntries(buoyancy.modes.map((d) => [d.id, true]));
const build = (raw: Record<string, unknown>, modes: ModeState = allOn, lang: 'ky' | 'ru' | 'en' = 'ru') => buoyancy.build(raw, { modes, lang });
const names = (parts: Part[]) => new Set(parts.map((p) => p.name));
const textOf = (parts: Part[], name: string) => {
  const p = parts.find((x) => x.name === name);
  return p && p.shape.kind === 'text' ? p.shape.text : '';
};
const VARIANTS = ['dynamometer', 'float', 'balloon', 'compare'] as const;

describe('buoyancy: params', () => {
  it('defaults and lenient parsing', () => {
    expect(parseBuoyancyParams(null)).toEqual(DEFAULT_BUOYANCY);
    const p = parseBuoyancyParams({ variant: 'float', liquid: 'milk', bodies: [{ id: 'X', material: 'gold', volume: -1, shape: 'cone' }, { id: '' }, { id: 'X' }, 4], submerged: 2 });
    expect(p.liquid).toBe('water');
    expect(p.bodies).toEqual([{ id: 'X', material: 'iron', volume: 1e-4, shape: 'cube' }]);
    expect(p.submerged).toBe(1);
    expect(parseBuoyancyParams({ variant: 'float' }).bodies).toEqual(DEFAULT_BODIES.float);
    expect(parseBuoyancyParams({ bodies: Array.from({ length: 9 }, (_, i) => ({ id: `b${i}` })) }).bodies).toHaveLength(5);
  });
  it('density table', () => {
    expect(MATERIALS.iron.rho).toBe(7800);
    expect(MATERIALS.cork.rho).toBe(240);
    expect(niceCeil(7.64)).toBe(10);
    expect(niceCeil(0.18)).toBe(0.2);
  });
});

describe('buoyancy: physics', () => {
  it('geometry: volumes and submerged shares', () => {
    for (const s of ['cube', 'sphere', 'cylinder'] as const) {
      const g = bodyGeom(s, 1e-4);
      expect(g.shareAt(g.h)).toBeCloseTo(1, 6);
      expect(g.shareAt(0)).toBe(0);
      expect(g.shareAt(g.depthFor(0.3))).toBeCloseTo(0.3, 6);
    }
    expect(bodyGeom('cube', 1e-3).w).toBeCloseTo(0.1);
    // Half a sphere sits at its equator.
    const sph = bodyGeom('sphere', 1e-3);
    expect(sph.depthFor(0.5)).toBeCloseTo(sph.h / 2, 6);
  });
  it("Archimedes: F_A = ρ_l·g·V; the dynamometer reading falls by F_A", () => {
    expect(buoyantForce(1000, 9.8, 1e-4)).toBeCloseTo(0.98);
    const s = dynamometerState(parseBuoyancyParams({}));
    expect(s.weight).toBeCloseTo(7.644);
    expect(s.buoyant).toBeCloseTo(0.98);
    expect(s.reading).toBeCloseTo(6.664);
    expect(s.displaced).toBeCloseTo(1e-4);
    const half = dynamometerState(parseBuoyancyParams({ submerged: 0.5, liquid: 'brine' }));
    expect(half.buoyant).toBeCloseTo(1030 * 9.8 * 0.5e-4);
    // Wood floats: the spring goes slack at P₁ = 0, only ρ_b/ρ_l of it goes under.
    const wood = dynamometerState(parseBuoyancyParams({ bodies: [{ id: 'W', material: 'wood' }] }));
    expect(wood.share).toBeCloseTo(0.6);
    expect(wood.reading).toBeCloseTo(0, 9);
  });
  it('sink / float / hover and the submerged share', () => {
    expect(fateOf(7800, 1000).fate).toBe('sinks');
    expect(fateOf(900, 1000)).toEqual({ fate: 'floats', share: 0.9 });
    expect(fateOf(7800, 13600).fate).toBe('floats');
    expect(fateOf(1000, 1000).fate).toBe('hovers');
  });
  it('bodies settle where the forces balance', () => {
    const Hl = 0.2;
    const g = bodyGeom('cube', 1e-4);
    const ice = floatPath('floats', 0.9, g, Hl, 0.5);
    expect(ice(20)).toBeCloseTo(Hl - 0.9 * g.h + g.h / 2, 4);
    const iron = floatPath('sinks', 1, g, Hl, 0.5);
    expect(iron(20)).toBeCloseTo(g.h / 2 + 0.004, 6);
    expect(iron(0)).toBeGreaterThan(Hl);
  });
  it('balloon: rises when ρ_air·g·V > (m_gas + m_load)·g', () => {
    const s = balloonState(parseBuoyancyParams({ variant: 'balloon' }));
    expect(s.buoyant).toBeCloseTo(1.29 * 9.8 * 0.02);
    expect(s.gasMass).toBeCloseTo(0.0036);
    expect(s.rises).toBe(true);
    expect(balloonState(parseBuoyancyParams({ variant: 'balloon', payload: 0.05 })).rises).toBe(false);
  });
  it('compare: equal masses → V = m/ρ; equal volumes → m = ρV', () => {
    const m = compareItems(parseBuoyancyParams({ variant: 'compare', mass: 1 }));
    expect(m.map((x) => x.mass)).toEqual([1, 1]);
    expect(m[0].volume).toBeCloseTo(1 / 7800);
    expect(m[1].volume).toBeCloseTo(1 / 600);
    const v = compareItems(parseBuoyancyParams({ variant: 'compare', equal: 'volume' }));
    expect(v[0].mass).toBeCloseTo(0.78);
    expect(v[1].mass).toBeCloseTo(0.06);
  });
});

describe('buoyancy: parts', () => {
  it('contract part names per variant', () => {
    const expected: Record<(typeof VARIANTS)[number], string[]> = {
      dynamometer: ['Beaker', 'Liquid', 'Body_A', 'Dynamometer', 'Cup', 'Arrow_Buoyancy_A', 'Arrow_Gravity_A', 'Readout'],
      float: ['Beaker', 'Liquid', 'Body_A', 'Body_B', 'Body_C', 'Arrow_Buoyancy_B', 'Arrow_Gravity_C', 'Arrow_Support_A', 'Readout'],
      balloon: ['Balloon', 'Basket', 'Arrow_Buoyancy_Balloon', 'Arrow_Gravity_Balloon', 'Readout'],
      compare: ['Balance', 'Body_A', 'Body_B', 'Arrow_Gravity_A', 'Readout'],
    };
    for (const v of VARIANTS) {
      const n = names(build({ variant: v }));
      for (const e of expected[v]) expect(n, `${v}: ${e}`).toContain(e);
    }
  });
  it('readouts in the scene language', () => {
    expect(textOf(build({}, {}, 'ru'), 'Readout')).toContain('P₁ = P − F_A = 7,64 Н − 0,98 Н = 6,66 Н');
    expect(textOf(build({}, {}, 'ky'), 'Dynamometer_Liquid')).toContain('6,66 Н');
    expect(textOf(build({ variant: 'float' }, {}, 'ky'), 'Body_A_Label')).toContain('чөгөт');
    expect(textOf(build({ variant: 'float' }, {}, 'en'), 'Body_C_Label')).toContain('floats');
    expect(textOf(build({ variant: 'compare', mass: 1 }, {}, 'ru'), 'Body_B_Label')).toContain('V = 1667 см³');
    expect(textOf(build({ variant: 'balloon' }, {}, 'ru'), 'Readout')).toContain('шар поднимается');
  });
  it('dynamometer: the reading drops while the body goes in and the cup fills', () => {
    const parts = build({});
    const ptr = parts.find((p) => p.name === 'Dynamometer_Pointer')!;
    const cup = parts.find((p) => p.name === 'Cup_Liquid')!;
    // Pointer offset below the spring top ∝ the reading.
    const off0 = ptr.motion!(0).position![1];
    const off1 = ptr.motion!(6).position![1];
    expect(off1).toBeGreaterThan(off0);
    expect(cup.motion!(0).visible).toBe(false);
    expect(cup.motion!(6).visible).toBe(true);
  });
  it('robust: unique names, parents exist, motions finite, part counts modest', () => {
    const odd = { liquid: 'mercury', submerged: 0, bodies: [{ id: 'A', material: 'cork', shape: 'sphere', volume: 0.5 }, { id: 'B', material: 'copper', shape: 'cylinder', volume: 1e-6 }, { id: 'C', material: 'paraffin' }], payload: 100, balloonVolume: 1000, equal: 'volume' };
    for (const v of VARIANTS) {
      for (const raw of [{ variant: v }, { variant: v, ...odd }]) {
        for (const modes of [allOn, defaultModeState(resolveModes(buoyancy.modes, []))]) {
          const parts = build(raw, modes);
          expect(parts.length).toBeLessThan(400);
          expect(new Set(parts.map((p) => p.name)).size, `${v} unique`).toBe(parts.length);
          const n = names(parts);
          for (const p of parts) if (p.parent) expect(n, `${v}: parent of ${p.name}`).toContain(p.parent);
          for (const t of [0, 0.4, 1.3, 3, 7.7, 60]) {
            const c = buoyancy.clock(raw, undefined, t);
            expect(Number.isFinite(c)).toBe(true);
            for (const p of parts) {
              const r = p.motion?.(c);
              for (const x of [r?.position, r?.scale, r?.rotation]) if (x) expect(x.every(Number.isFinite), `${v} ${p.name}`).toBe(true);
            }
          }
        }
      }
    }
  });
});
