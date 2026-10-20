import { describe, it, expect } from 'vitest';
import type { Part } from '@bilig/scene-kit';
import {
  BEADS, DEFAULT_WAVES, ECHO_MIN_DELAY, SOUND_SPEED, echoClock, echoTime, featureAt, parseWavesParams, waveDisplacement, waveVelocity, waveView, waves, wavesReadout, wavePeriod,
} from './waves.js';

const ALL = Object.fromEntries(waves.modes.map((m) => [m.id, true]));
const build = (params: Record<string, unknown>, modes: Record<string, boolean> = ALL, lang: 'ky' | 'ru' | 'en' = 'ru') => waves.build({ model: 'waves', ...params }, { modes, lang });
const names = (parts: Part[]) => new Set(parts.map((p) => p.name));
const byName = (parts: Part[], n: string) => parts.find((p) => p.name === n)!;

describe('waves: params', () => {
  it('defaults: transverse rope, A = 0.3, λ = 2, ν = 1, v = λν = 2, s = 170', () => {
    expect(DEFAULT_WAVES).toEqual({ variant: 'transverse', medium: 'rope', amplitude: 0.3, wavelength: 2, frequency: 1, speed: 2, distance: 170 });
  });
  it('garbage → defaults, never throws', () => {
    expect(parseWavesParams(null)).toEqual(DEFAULT_WAVES);
    expect(parseWavesParams({ variant: 'x', amplitude: -1, wavelength: 'a', frequency: NaN, medium: 3 })).toEqual(DEFAULT_WAVES);
  });
  it('medium follows the variant', () => {
    expect(parseWavesParams({ variant: 'longitudinal' }).medium).toBe('spring');
    expect(parseWavesParams({ variant: 'sound' }).medium).toBe('air');
    expect(parseWavesParams({ variant: 'echo', medium: 'water' }).medium).toBe('water');
  });
  it('v = λν; the missing one of λ, ν follows from speed', () => {
    expect(parseWavesParams({ wavelength: 0.5, frequency: 4 }).speed).toBe(2);
    const p = parseWavesParams({ speed: 6, frequency: 2 });
    expect(p.wavelength).toBe(3);
    expect(parseWavesParams({ speed: 6, wavelength: 3 }).frequency).toBe(2);
  });
  it('sound: v from the medium (book table 5), λ = v/ν, 440 Hz by default', () => {
    const s = parseWavesParams({ variant: 'sound' });
    expect(s.speed).toBe(SOUND_SPEED.air);
    expect(s.frequency).toBe(440);
    expect(s.wavelength).toBeCloseTo(0.75, 6);
    expect(parseWavesParams({ variant: 'sound', medium: 'water', frequency: 1440 }).wavelength).toBeCloseTo(1, 9);
    expect(parseWavesParams({ variant: 'sound', speed: 340, frequency: 170 }).wavelength).toBe(2);
  });
});

describe('waves: physics', () => {
  it('y = A·sin(2π(x/λ − νt)) behind the front, 0 ahead of it', () => {
    expect(waveDisplacement(0.5, 1, 0.3, 2, 1)).toBeCloseTo(0.3 * Math.sin(2 * Math.PI * (0.25 - 1)), 12);
    expect(waveDisplacement(3, 1, 0.3, 2, 1)).toBe(0); // front at x = 2
    expect(waveDisplacement(1, 0, 0.3, 2, 1)).toBe(0);
    // velocity is the time derivative
    const h = 1e-6;
    const d = (waveDisplacement(0.7, 1.3 + h, 0.3, 2, 1) - waveDisplacement(0.7, 1.3 - h, 0.3, 2, 1)) / (2 * h);
    expect(waveVelocity(0.7, 1.3, 0.3, 2, 1)).toBeCloseTo(d, 5);
  });
  it('the wave repeats after T in time and λ in space', () => {
    for (const x of [0.1, 0.9, 1.5]) {
      expect(waveDisplacement(x, 5 + wavePeriod(1), 0.3, 2, 1)).toBeCloseTo(waveDisplacement(x, 5, 0.3, 2, 1), 9);
      expect(waveDisplacement(x + 2, 5, 0.3, 2, 1)).toBeCloseTo(waveDisplacement(x, 5, 0.3, 2, 1), 9);
    }
  });
  it('featureAt finds crests (phase ¼) where y = A', () => {
    for (const t of [0.3, 2.7, 9.1]) {
      const x = featureAt(t, 2, 1, 0.25, 0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2);
      expect(0.3 * Math.sin(2 * Math.PI * (x / 2 - t))).toBeCloseTo(0.3, 9);
    }
  });
  it('echo: t = 2s/v (170 m in air → 1.03 s); the book’s 11 m gives 1/15 s', () => {
    expect(echoTime(170, 330)).toBeCloseTo(1.0303, 4);
    expect(echoTime(11, 330)).toBeCloseTo(ECHO_MIN_DELAY, 9);
    const p = parseWavesParams({ variant: 'echo' });
    expect(echoClock(p, 0)).toBe(0);
    expect(echoClock(p, 5)).toBeCloseTo(echoTime(170, 330), 9);
    expect(echoClock(p, 6)).toBeCloseTo(echoTime(170, 330), 9); // pause on the echo
    expect(echoClock(p, 6.6 + 2.5)).toBeCloseTo(echoTime(170, 330) / 2, 9); // next round
    expect(waves.clock({ variant: 'echo' }, { time: 99, fraction: 0.5, stepIndex: 0, stepFraction: 0 }, 0)).toBeCloseTo(echoTime(170, 330) / 2, 9);
  });
  it('scene view keeps a whole λ on the rope and slows fast waves', () => {
    expect(waveView(parseWavesParams({ wavelength: 20 })).lam).toBe(3);
    const v = waveView(parseWavesParams({ frequency: 10 }));
    expect(v.nu).toBe(1.5);
    expect(v.slow).toBeCloseTo(10 / 1.5, 9);
    const s = waveView(parseWavesParams({ variant: 'sound' }));
    expect(s.lam).toBeCloseTo(0.75, 9);
    expect(s.slow).toBeCloseTo(550, 9);
  });
});

describe('waves: parts', () => {
  it('transverse: 40 beads, rope, hand, λ and A markers; beads follow y(x, t)', () => {
    const parts = build({});
    const n = names(parts);
    for (const e of ['Source', 'Medium', 'Bead_1', `Bead_${BEADS}`, 'Equilibrium', 'Marker_Wavelength', 'Marker_Amplitude', 'Arrow_Wave', 'Crest', 'Trace_1', 'Readout']) expect(n, e).toContain(e);
    expect(n).not.toContain(`Bead_${BEADS + 1}`);
    // Bead_11 sits 10·6/39 m from the hand; scene λ = 2, A = 0.3, ν = 1.
    const x = (10 * 6) / 39;
    const pos = byName(parts, 'Bead_11').motion!(3.7).position!;
    expect(pos[1] - 1.3).toBeCloseTo(0.3 * Math.sin(2 * Math.PI * (x / 2 - 3.7)), 9);
    expect(pos[0]).toBeCloseTo(-3 + x, 9);
    // The hand moves with the end of the rope.
    expect(byName(parts, 'Source').motion!(3.7).position![1] - 1.3).toBeCloseTo(0.3 * Math.sin(-2 * Math.PI * 3.7), 9);
    // The λ marker spans two crests.
    const m = byName(parts, 'Marker_Wavelength').motion!(6.2);
    expect(m.visible).toBe(true);
    const x0 = m.position![0] + 3;
    expect(waveDisplacement(x0, 6.2, 0.3, 2, 1)).toBeCloseTo(0.3, 9);
    expect(waveDisplacement(x0 + 2, 6.2, 0.3, 2, 1)).toBeCloseTo(0.3, 9);
  });
  it('longitudinal: beads move along x and never pass each other; compressions shown', () => {
    const parts = build({ variant: 'longitudinal', amplitude: 0.3 });
    const n = names(parts);
    for (const e of ['Source', 'Medium', 'Bead_1', 'Compression_1', 'Rarefaction_1', 'Marker_Wavelength', 'Marker_Amplitude', 'Arrow_Bead_2']) expect(n, e).toContain(e);
    for (const t of [0.5, 2.3, 7.77]) {
      const xs = Array.from({ length: BEADS }, (_, i) => byName(parts, `Bead_${i + 1}`).motion!(t).position!);
      for (const p of xs) expect(p[1]).toBe(1.3);
      for (let i = 1; i < BEADS; i++) expect(xs[i][0]).toBeGreaterThan(xs[i - 1][0]);
    }
  });
  it('sound: tuning fork, instanced air, compressions, ear', () => {
    const parts = build({ variant: 'sound' });
    const n = names(parts);
    for (const e of ['Source', 'Source_Prong_1', 'Source_Box', 'Medium', 'Air_Particles', 'Air_Tracer_1', 'Compression_1', 'Ear', 'Marker_Wavelength', 'Arrow_Air_1']) expect(n, e).toContain(e);
    const air = byName(parts, 'Air_Particles');
    expect(air.shape.kind).toBe('instances');
    if (air.shape.kind === 'instances') {
      expect(air.shape.positions.length).toBeGreaterThan(300);
      expect(air.shape.positions.length).toBeLessThan(600);
      expect(air.instanceMotion!(0, 0)).toEqual(air.shape.positions[0]);
    }
  });
  it('echo: wall, ear, pulse out then back, stopwatch', () => {
    const parts = build({ variant: 'echo' });
    const n = names(parts);
    for (const e of ['Source', 'Wall', 'Ear', 'Medium', 'Air_Particles', 'Pulse_Out', 'Pulse_Back', 'Marker_Distance', 'Stopwatch', 'Echo_Heard', 'Arrow_Velocity_Out']) expect(n, e).toContain(e);
    const T = echoTime(170, 330);
    expect(byName(parts, 'Pulse_Out').motion!(T * 0.25).visible).toBe(true);
    expect(byName(parts, 'Pulse_Back').motion!(T * 0.25).visible).toBe(false);
    expect(byName(parts, 'Pulse_Back').motion!(T * 0.75).visible).toBe(true);
    expect(byName(parts, 'Echo_Heard').motion!(T * 0.9).visible).toBe(false);
    expect(byName(parts, 'Echo_Heard').motion!(T).visible).toBe(true);
    // The pulse front reaches the cliff at T/2.
    const out = byName(parts, 'Pulse_Out').motion!(T / 2 - 1e-9).position![0];
    expect(out + 1.1).toBeCloseTo(3.6, 6);
  });
  it('every variant: unique names, parents exist, modest counts, finite motions', () => {
    for (const variant of ['transverse', 'longitudinal', 'sound', 'echo']) {
      for (const medium of [undefined, 'rope', 'spring', 'air', 'water']) {
        for (const modes of [ALL, {}]) {
          const parts = build({ variant, medium, amplitude: 1, wavelength: 0.3, frequency: 7 }, modes);
          const n = names(parts);
          expect(n.size, variant).toBe(parts.length);
          expect(parts.length, variant).toBeLessThanOrEqual(400);
          for (const p of parts) if (p.parent) expect(n, `${variant}: parent of ${p.name}`).toContain(p.parent);
          for (const t of [0, 0.4, 3, 50]) {
            const c = waves.clock({ variant }, undefined, t);
            expect(Number.isFinite(c)).toBe(true);
            for (const p of parts) {
              const r = p.motion?.(c);
              for (const v of [r?.position, r?.scale, r?.rotation]) if (v) expect(v.every(Number.isFinite), `${variant} ${p.name}`).toBe(true);
              if (p.instanceMotion && p.shape.kind === 'instances') expect(p.instanceMotion(c, 0).every(Number.isFinite)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('waves: readouts', () => {
  it('λ, A, ν, T, v in three languages', () => {
    expect(wavesReadout(DEFAULT_WAVES, 'ru')).toEqual(['Поперечная волна', 'λ = 2 м', 'A = 0,3 м', 'ν = 1 Гц', 'T = 1/ν = 1 с', 'v = λν = 2 м/с']);
    expect(wavesReadout(DEFAULT_WAVES, 'ky')[0]).toBe('Туурасынан толкун');
    expect(wavesReadout(DEFAULT_WAVES, 'en')).toContain('ν = 1 Hz');
    expect(wavesReadout(parseWavesParams({ variant: 'sound' }), 'ru')).toEqual(['Звуковые волны', 'ν = 440 Гц', 'T = 1/ν = 0,00227 с', 'v = 330 м/с', 'λ = v/ν = 0,75 м']);
    expect(wavesReadout(parseWavesParams({ variant: 'echo' }), 'ky')).toEqual(['Жаңырык', 's = 170 м', 'v = 330 м/с', 't = 2s/v = 1,03 с']);
    expect(wavesReadout(parseWavesParams({ variant: 'echo', distance: 5 }), 'ru').at(-1)).toContain('1/15');
  });
  it('labels mode draws the readout; slowed waves say so', () => {
    const t = (parts: Part[]) => { const s = byName(parts, 'Readout').shape; return s.kind === 'text' ? s.text : ''; };
    expect(t(build({}, { labels: true }))).toContain('v = λν = 2 м/с');
    expect(t(build({ variant: 'sound' }, { labels: true }, 'ky'))).toContain('жайлатылып');
    expect(names(build({}, {}))).not.toContain('Readout');
  });
});
