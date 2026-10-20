import { describe, it, expect } from 'vitest';
import type { Part } from '@bilig/scene-kit';
import type { SimModel } from './common.js';
import { DEFAULT_KINEMATICS, distanceTimeCurve, distanceTimePoints, kinematics, kinematicsState, parseKinematicsParams, segmentRun, speedTimePoints } from './kinematics.js';
import { DEFAULT_CIRCULAR, circular, circularAngle, circularState, parseCircularParams } from './circular.js';
import { DEFAULT_SPRING, parseSpringParams, spring, springAttachTime, springStages, springStretch } from './spring.js';
import { DEFAULT_MOMENTUM, cartMotion, collide, momentum, parseMomentumParams, pushApart, rocketSpeed } from './momentum.js';
import { DEFAULT_PULLEY, parsePulleyParams, pulley, pulleyLift, pulleyState } from './pulley.js';

function build(m: SimModel, params: Record<string, unknown>, modes: Record<string, boolean> = {}, lang: 'ky' | 'ru' | 'en' = 'ru'): Part[] {
  const all = Object.fromEntries([...(m.modesFor?.(params) ?? m.modes)].map((d) => [d.id, true]));
  return m.build({ model: m.id, ...params }, { modes: { ...all, ...modes }, lang });
}
const names = (parts: Part[]) => new Set(parts.map((p) => p.name));
function expectParts(parts: Part[], expected: string[]) {
  const n = names(parts);
  for (const e of expected) expect(n, e).toContain(e);
}
const byName = (parts: Part[], n: string) => parts.find((p) => p.name === n)!;
const texts = (parts: Part[]) => parts.filter((p) => p.shape.kind === 'text').map((p) => (p.shape as { text: string }).text).join('\n');

const CASES: [SimModel, Record<string, unknown>[]][] = [
  [kinematics, [{ segments: [{ v: 0, t: 4, a: 2 }, { v: 8, t: 3 }, { t: 5, a: -4 }] }, { segments: [{ v: 5, t: 2, a: 1 }], graph: 'v', radar: true }]],
  [circular, [{}, { object: 'car', radius: 50 }, { object: 'carousel', period: 6, showVelocity: false }]],
  [spring, [{}, { variant: 'dynamometer', loads: [{ id: '1', mass: 0.1 }, { id: '2', mass: 0.1 }, { id: '3', mass: 0.2 }] }, { stiffness: 1000, loads: [{ id: 'x', mass: 5 }] }]],
  [momentum, [{}, { elastic: false, carts: [{ id: 'A', mass: 2, v: 1.5 }, { id: 'B', mass: 1, v: -0.5 }] }, { variant: 'push', carts: [{ id: 'A', mass: 1 }, { id: 'B', mass: 3 }] }, { variant: 'rocket' }, { carts: [{ id: 'A', mass: 1, v: 0 }, { id: 'B', mass: 1, v: 2 }] }]],
  [pulley, [{}, { variant: 'movable', pulleyMass: 1 }, { variant: 'tackle', friction: 0.2, height: 3 }]],
];

describe('mechanics models: robustness', () => {
  const junk: unknown[] = [{}, { segments: 'x', loads: {}, carts: [null, 3], variant: 7, object: 'boat', radius: -1, stiffness: 'k', rocket: [], height: NaN, friction: 9 }, { foo: NaN }];
  it('garbage params never throw; names unique, parents exist, motions finite', () => {
    for (const [m, good] of CASES) {
      for (const params of [...junk, ...good]) {
        for (const allOn of [true, false]) {
          const modes = allOn ? Object.fromEntries(m.modes.map((d) => [d.id, true])) : {};
          for (const lang of ['ky', 'ru', 'en'] as const) {
            const parts = m.build({ model: m.id, ...(params as object) }, { modes, lang });
            expect(parts.length, m.id).toBeGreaterThan(0);
            expect(parts.length, `${m.id} part count`).toBeLessThanOrEqual(400);
            expect(new Set(parts.map((p) => p.name)).size, `${m.id} unique names`).toBe(parts.length);
            const n = names(parts);
            for (const p of parts) if (p.parent) expect(n, `${m.id}: parent of ${p.name}`).toContain(p.parent);
            if (lang !== 'ru') continue;
            for (const t of [0, 0.3, 1.7, 3, 7.5, 50]) {
              const c = m.clock({ model: m.id, ...(params as object) }, undefined, t);
              expect(Number.isFinite(c), m.id).toBe(true);
              for (const p of parts) {
                const r = p.motion?.(c);
                for (const v of [r?.position, r?.scale, r?.rotation]) if (v) expect(v.every(Number.isFinite), `${m.id} ${p.name}`).toBe(true);
                if (p.instanceMotion && p.shape.kind === 'instances') expect(p.instanceMotion(c, 3).every(Number.isFinite)).toBe(true);
              }
            }
          }
        }
      }
    }
  });
  it('readouts are localized', () => {
    expect(texts(build(pulley, {}, {}, 'ky'))).toContain('Дж');
    expect(texts(build(pulley, {}, {}, 'en'))).toContain(' J');
    expect(texts(build(spring, {}, {}, 'ky'))).toContain('Fсерп');
    expect(texts(build(spring, {}, {}, 'ru'))).toContain('Fупр');
    expect(texts(build(spring, {}, {}, 'en'))).toContain('Fel');
    expect(texts(build(momentum, {}, {}, 'ky'))).toContain('кг·м/с');
    expect(texts(build(circular, {}, {}, 'en'))).toContain('Hz');
  });
});

describe('kinematics with acceleration', () => {
  it('backward compatible parsing; a kept only when ≠ 0; v continues when omitted', () => {
    expect(parseKinematicsParams({})).toEqual(DEFAULT_KINEMATICS);
    expect(parseKinematicsParams({ segments: [{ v: 3, t: 4, a: 0 }] }).segments).toEqual([{ v: 3, t: 4 }]);
    const p = parseKinematicsParams({ segments: [{ v: 0, t: 5, a: 2 }, { t: 2, a: -4 }, { t: 1 }] });
    expect(p.segments).toEqual([{ v: 0, t: 5, a: 2 }, { v: 10, t: 2, a: -4 }]);
    expect(p.graph).toBe('both');
    expect(parseKinematicsParams({ segments: [{ v: 5, t: 1 }] }).graph).toBe('s');
    expect(parseKinematicsParams({ segments: [{ v: 5, t: 1, a: 1 }], graph: 'v' }).graph).toBe('v');
    expect(parseKinematicsParams({ segments: [{ v: 5, t: 1, a: 1 }], graph: 'zz' }).graph).toBe('both');
  });
  it('s = v·t + a·t²/2; braking stops at v = 0 and waits', () => {
    const segs = [{ v: 0, t: 5, a: 2 }, { v: 10, t: 4, a: -5 }];
    expect(kinematicsState(segs, 3)).toMatchObject({ speed: 6, acceleration: 2, segment: 0 });
    expect(kinematicsState(segs, 3).distance).toBeCloseTo(9, 9);
    expect(kinematicsState(segs, 5).distance).toBeCloseTo(25, 9);
    // Stops 2 s into braking after 10·2 − 5·4/2 = 10 m, then waits.
    expect(kinematicsState(segs, 6).distance).toBeCloseTo(25 + 7.5, 9);
    expect(kinematicsState(segs, 7.5)).toMatchObject({ speed: 0, acceleration: 0 });
    expect(kinematicsState(segs, 99).distance).toBeCloseTo(35, 9);
    expect(kinematicsState(segs, 0).totalDistance).toBeCloseTo(35, 9);
    expect(segmentRun({ v: 10, t: 4, a: -5 })).toMatchObject({ stopAt: 2, v1: 0, d: 10 });
    expect(distanceTimePoints(segs)).toEqual([[0, 0], [5, 25], [9, 35]]);
    const curve = distanceTimeCurve(segs, 4);
    expect(curve).toHaveLength(9);
    expect(curve[2][1]).toBeCloseTo(6.25, 9);
    expect(speedTimePoints(segs)).toEqual([[0, 0], [5, 10], [7, 0], [9, 0]]);
    // A jump between segments is two points at the same t.
    expect(speedTimePoints([{ v: 4, t: 2 }, { v: 8, t: 1 }])).toEqual([[0, 4], [2, 4], [2, 8], [3, 8]]);
  });
  it('uniform scenes build exactly as before; accelerated ones add a, v(t) and readouts', () => {
    const uni = build(kinematics, { segments: [{ v: 10, t: 5 }, { v: 0, t: 3 }] });
    const n = names(uni);
    for (const x of ['Arrow_Acceleration', 'GraphV', 'Readout_1', 'Car_Brake_1']) expect(n).not.toContain(x);
    expectParts(uni, ['Car', 'Road', 'Graph_Axes', 'Graph_Line_1', 'Graph_Line_2', 'Graph_Point', 'Arrow_Velocity_1']);
    const acc = build(kinematics, { segments: [{ v: 0, t: 4, a: 2 }, { v: 8, t: 3, a: -4 }], radar: true });
    expectParts(acc, ['Arrow_Acceleration', 'Arrow_Acceleration_1', 'Arrow_Acceleration_2', 'Graph_Line', 'GraphV', 'GraphV_Axis_V', 'GraphV_Line', 'GraphV_Point', 'Readout_1', 'Car_Brake_1', 'Radar_Display_1']);
    expect(names(build(kinematics, { segments: [{ v: 0, t: 4, a: 2 }], graph: 'v' }))).not.toContain('Graph_Axes');
    expect(texts(acc)).toContain('a = 2 м/с²');
    // Braking arrow points backwards.
    const brake = byName(acc, 'Arrow_Acceleration_2').shape as { vector: number[] };
    expect(brake.vector[0]).toBeLessThan(0);
  });
});

describe('circular', () => {
  it('defaults and lenient params', () => {
    expect(parseCircularParams(undefined)).toEqual(DEFAULT_CIRCULAR);
    expect(parseCircularParams({ radius: -3, period: 0, object: 'x' })).toEqual(DEFAULT_CIRCULAR);
  });
  it('T, ν = 1/T, v = 2πR/T', () => {
    const s = circularState(parseCircularParams({ radius: 2, period: 4 }));
    expect(s.frequency).toBeCloseTo(0.25, 12);
    expect(s.speed).toBeCloseTo(Math.PI, 12);
    expect(circularAngle(DEFAULT_CIRCULAR, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(texts(build(circular, {}))).toContain('3,14 м/с');
  });
  it('parts; velocity is tangent and turns with the radius', () => {
    for (const object of ['ball', 'car', 'carousel']) expectParts(build(circular, { object }), ['Center', 'Path', 'Body', 'Radius', 'Arrow_Velocity', 'Trace', 'Trace_12']);
    const parts = build(circular, {});
    const r = byName(parts, 'Radius').shape as { from: number[]; to: number[] };
    const v = byName(parts, 'Arrow_Velocity').shape as { vector: number[] };
    const rad = [r.to[0] - r.from[0], r.to[1] - r.from[1], r.to[2] - r.from[2]];
    expect(rad[0] * v.vector[0] + rad[1] * v.vector[1] + rad[2] * v.vector[2]).toBeCloseTo(0, 12);
    expect(byName(parts, 'Arrow_Velocity').parent).toBe('Spin');
    expect(byName(parts, 'Spin').motion!(1).rotation![1]).toBeCloseTo(Math.PI / 2, 12);
    // showVelocity: false turns the vectors mode off by default.
    expect(circular.modesFor!({ showVelocity: false }).find((d) => d.id === 'vectors')?.default).toBeFalsy();
    expect(names(build(circular, {}, { vectors: false }))).not.toContain('Arrow_Velocity');
  });
});

describe('spring', () => {
  it('defaults, at most 5 loads, unique ids', () => {
    expect(parseSpringParams({})).toEqual(DEFAULT_SPRING);
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `L${i}`, mass: 0.1 }));
    expect(parseSpringParams({ loads: many }).loads).toHaveLength(5);
    expect(parseSpringParams({ loads: [{ id: 'a', mass: 1 }, { id: 'a', mass: 2 }, { id: 'b', mass: -1 }] }).loads).toEqual([{ id: 'a', mass: 1 }]);
  });
  it('x = m·g/k, F = kx = P, and each load adds the same stretch per kg', () => {
    const p = parseSpringParams({ stiffness: 40, loads: [{ id: '1', mass: 0.1 }, { id: '2', mass: 0.1 }, { id: '3', mass: 0.2 }], g: 9.8 });
    const st = springStages(p);
    expect(st.map((s) => s.mass)).toEqual([0.1, 0.2, 0.4].map((x) => expect.closeTo(x, 12)));
    expect(st[0].stretch).toBeCloseTo(0.0245, 12);
    expect(st[2].stretch).toBeCloseTo(4 * st[0].stretch, 12);
    for (const s of st) expect(s.elastic).toBeCloseTo(s.weight, 12);
    // Settles near the rest stretch before the next load goes on; nothing before the first.
    expect(springStretch(p, 0)).toBe(0);
    expect(springStretch(p, springAttachTime(1) - 1e-3)).toBeCloseTo(st[0].stretch, 3);
    expect(springStretch(p, springAttachTime(2) + 2.9)).toBeCloseTo(st[2].stretch, 3);
  });
  it('parts and readouts', () => {
    const parts = build(spring, { loads: [{ id: '1', mass: 0.1 }, { id: '2', mass: 0.2 }] });
    expectParts(parts, ['Stand', 'Spring', 'Hook', 'Load_1', 'Load_2', 'Ruler', 'Pointer', 'Arrow_Elastic', 'Arrow_Gravity', 'Arrow_Weight']);
    expect(names(parts)).not.toContain('Dynamometer');
    expect(texts(parts)).toContain('P = mg = 2,94 Н');
    expect(texts(parts)).toContain('x = 7,4 см');
    expectParts(build(spring, { variant: 'dynamometer' }), ['Dynamometer', 'Dynamometer_Tick_0', 'Spring', 'Pointer']);
    expect(names(build(spring, { showScale: false }))).not.toContain('Ruler');
    // The pointer rides on the hook, which goes down by the stretch.
    const hook = byName(parts, 'Hook');
    const t = springAttachTime(1) + 2.9;
    expect(hook.motion!(0).position![1] - hook.motion!(t).position![1]).toBeGreaterThan(0.1);
  });
});

describe('momentum', () => {
  it('defaults and lenient params', () => {
    expect(parseMomentumParams({})).toEqual(DEFAULT_MOMENTUM);
    const p = parseMomentumParams({ carts: [{ id: 'X', mass: 2, v: 3 }, { id: 'X', mass: -1 }], variant: 'boom' });
    expect(p.variant).toBe('collision');
    expect(p.carts).toEqual([{ id: 'A', mass: 2, v: 3 }, { id: 'B', mass: 1, v: 0 }]);
  });
  it('Σp is conserved; elastic also keeps kinetic energy; inelastic sticks', () => {
    const a = { id: 'A', mass: 2, v: 3 };
    const b = { id: 'B', mass: 1, v: -1 };
    const e = collide(a, b, true);
    expect(a.mass * e.vA + b.mass * e.vB).toBeCloseTo(2 * 3 - 1, 12);
    expect(a.mass * e.vA ** 2 + b.mass * e.vB ** 2).toBeCloseTo(2 * 9 + 1, 12);
    const i = collide(a, b, false);
    expect(i.vA).toBeCloseTo(5 / 3, 12);
    expect(i.vB).toBe(i.vA);
    // Equal masses, elastic: they swap speeds.
    expect(collide({ id: 'A', mass: 1, v: 1 }, { id: 'B', mass: 1, v: 0 }, true)).toMatchObject({ vA: 0, vB: 1 });
    expect(collide({ id: 'A', mass: 1, v: 0 }, { id: 'B', mass: 1, v: 1 }, true).meet).toBe(false);
    const pa = pushApart({ id: 'A', mass: 1, v: 0 }, { id: 'B', mass: 3, v: 0 }, 0.5);
    expect(1 * pa.vA + 3 * pa.vB).toBeCloseTo(0, 12);
    expect(0.5 * pa.vA ** 2 + 1.5 * pa.vB ** 2).toBeCloseTo(0.5, 12);
    expect(rocketSpeed({ mass: 1, fuelMass: 0.5, gasSpeed: 200 })).toBe(100);
  });
  it('carts touch exactly at the collision and stay on the track', () => {
    for (const carts of [[{ id: 'A', mass: 1, v: 1 }, { id: 'B', mass: 1, v: 0 }], [{ id: 'A', mass: 3, v: 4 }, { id: 'B', mass: 1, v: -6 }]]) {
      for (const elastic of [true, false]) {
        const m = cartMotion(parseMomentumParams({ carts, elastic }));
        expect(m.xB(m.event) - m.xA(m.event)).toBeCloseTo(0.44, 9);
        for (let t = 0; t <= 4; t += 0.1) {
          expect(m.xB(t) - m.xA(t)).toBeGreaterThanOrEqual(0.44 - 1e-9);
          expect(Math.abs(m.xA(t))).toBeLessThanOrEqual(2.25 + 1e-9);
          expect(Math.abs(m.xB(t))).toBeLessThanOrEqual(2.25 + 1e-9);
        }
      }
    }
  });
  it('parts per variant', () => {
    expectParts(build(momentum, {}), ['Track', 'Cart_A', 'Cart_B', 'Arrow_Momentum_A', 'Arrow_Momentum_B', 'Impact', 'Readout_Before', 'Readout_After']);
    const push = build(momentum, { variant: 'push' });
    expectParts(push, ['Track', 'Cart_A', 'Cart_B', 'Spring', 'Thread', 'Arrow_Momentum_A', 'Arrow_Momentum_B']);
    expect(texts(push)).toContain('Σp′ = 0 кг·м/с');
    const rocket = build(momentum, { variant: 'rocket' });
    expectParts(rocket, ['Pad', 'Rocket', 'Exhaust', 'Exhaust_Flame', 'Arrow_Momentum_Rocket', 'Arrow_Momentum_Gas']);
    expect(names(rocket)).not.toContain('Track');
    expect(texts(rocket)).toContain('100 м/с');
    const ex = byName(rocket, 'Exhaust');
    // Gas goes down below the nozzle after ignition.
    expect(ex.instanceMotion!(1.4, 0)[1]).toBeLessThan(0.3);
  });
});

describe('pulley', () => {
  it('defaults and lenient params', () => {
    expect(parsePulleyParams({})).toEqual(DEFAULT_PULLEY);
    expect(parsePulleyParams({ friction: 0.9, speed: 0, variant: 'crane' })).toEqual(DEFAULT_PULLEY);
  });
  it('fixed: F = P, s = h; movable: F = (P + P_блок)/2, s = 2h; golden rule and efficiency', () => {
    const f = pulleyState(parsePulleyParams({ variant: 'fixed', loadMass: 10, height: 1, speed: 0.2 }));
    expect(f).toMatchObject({ ropeLength: 1, time: 5 });
    expect(f.force).toBeCloseTo(98, 9);
    expect(f.useful).toBeCloseTo(98, 9);
    expect(f.efficiency).toBeCloseTo(1, 12);
    expect(f.power).toBeCloseTo(19.6, 9);
    const m = pulleyState(parsePulleyParams({ variant: 'movable', loadMass: 10, pulleyMass: 1 }));
    expect(m.ropeLength).toBe(2);
    expect(m.force).toBeCloseTo((11 * 9.8) / 2, 9);
    expect(m.efficiency).toBeCloseTo(10 / 11, 12);
    const t = pulleyState(parsePulleyParams({ variant: 'tackle', loadMass: 10, friction: 0.2 }));
    expect(t.force).toBeCloseTo(98 / 2 / 0.8, 9);
    expect(t.efficiency).toBeCloseTo(0.8, 12);
    expect(t.total).toBeCloseTo(t.force * t.ropeLength, 9);
    expect(pulleyLift(DEFAULT_PULLEY, 2.5)).toBeCloseTo(0.5, 12);
    expect(pulleyLift(DEFAULT_PULLEY, -1)).toBe(0);
    expect(pulleyLift(DEFAULT_PULLEY, 99)).toBe(1);
  });
  it('parts per variant; wheels turn with the rope', () => {
    const fixed = build(pulley, {});
    expectParts(fixed, ['Beam', 'Pulley_Fixed', 'Rope', 'Rope_1', 'Rope_2', 'Load', 'Hand', 'Arrow_Effort', 'Arrow_Weight', 'Ruler', 'Bar_Useful', 'Bar_Total', 'Readout']);
    expect(names(fixed)).not.toContain('Pulley_Movable');
    const movable = build(pulley, { variant: 'movable' });
    expectParts(movable, ['Pulley_Movable', 'Rope_2']);
    expect(names(movable)).not.toContain('Pulley_Fixed');
    const tackle = build(pulley, { variant: 'tackle' });
    expectParts(tackle, ['Pulley_Fixed', 'Pulley_Movable', 'Rope_3']);
    // Fixed wheel: rope runs 1 m (shown) → turns by 1/R; tackle's fixed wheel twice as fast.
    const spinF = byName(fixed, 'Pulley_Fixed_Wheel_Spin').motion!;
    const spinT = byName(tackle, 'Pulley_Fixed_Wheel_Spin').motion!;
    expect(spinT(2).rotation![2]).toBeCloseTo(2 * spinF(2).rotation![2], 9);
    expect(Math.abs(spinF(5).rotation![2])).toBeCloseTo(1 / 0.16, 9);
    // The movable pulley rises with the load; the hand moves twice as far.
    const pm = byName(movable, 'Pulley_Movable').motion!;
    const hand = byName(movable, 'Hand').motion!;
    expect(pm(5).position![1] - pm(0).position![1]).toBeCloseTo(1, 9);
    expect(hand(5).position![1] - hand(0).position![1]).toBeCloseTo(2, 9);
    expect(texts(build(pulley, {}, {}, 'ky'))).toContain('η = Aп/Aт · 100 % = 100 %');
    expect(texts(fixed)).toContain('η = Aп/Aз · 100 % = 100 %');
    expect(texts(build(pulley, {}, {}, 'ru'))).toContain('19,6 Вт');
  });
});
