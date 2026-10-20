/**
 * `waves` (physics 7 §54–56): mechanical waves in an elastic medium.
 * - transverse: beads on a rope moved up and down by a hand,
 *   y = A·sin(2π(x/λ − νt)) behind the front x ≤ vt; λ and A markers ride on a crest;
 * - longitudinal: a coil spring (or beads joined by springs) pushed along x —
 *   the same law for the displacement along the rope, compressions and rarefactions;
 * - sound: a tuning fork on its resonance box, instanced air particles pushed
 *   radially in spreading compressions, an ear at the right;
 * - echo: a sound pulse runs to a cliff and back, t = 2s/v.
 * Readouts: λ, A, ν, T = 1/ν, v = λν (sound: λ = v/ν; echo: t = 2s/v).
 * Fast waves are drawn slowed down (the readouts keep the real numbers).
 */
import type { Lang, Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';
import {
  COLORS, L, LABELS, MODE, arrowLook, clamp, enumOr, fmt, numOr, obj, on, rng, text, tr, unit,
  type SimModel,
} from './common.js';

export const WAVE_VARIANTS = ['transverse', 'longitudinal', 'sound', 'echo'] as const;
export type WaveVariant = (typeof WAVE_VARIANTS)[number];
export const WAVE_MEDIA = ['rope', 'spring', 'air', 'water'] as const;
export type WaveMedium = (typeof WAVE_MEDIA)[number];

/** Speed of sound, m/s, at 20 °C (Physics 7, table 5). */
export const SOUND_SPEED: Record<'air' | 'water', number> = { air: 330, water: 1440 };
/** The ear tells an echo from the sound only when it comes at least 1/15 s later (§56). */
export const ECHO_MIN_DELAY = 1 / 15;
/** Tuning fork «A» when a sound scene gives no frequency. */
export const DEFAULT_SOUND_FREQUENCY = 440;

export interface WavesParams {
  variant: WaveVariant;
  medium: WaveMedium;
  /** m (transverse / longitudinal); for sound a loudness factor relative to 0.3. */
  amplitude: number;
  /** λ, m */
  wavelength: number;
  /** ν, Hz */
  frequency: number;
  /** v, m/s (λν for rope and spring; the medium's speed of sound for sound and echo). */
  speed: number;
  /** Echo: distance to the obstacle, m. */
  distance: number;
}

const DEFAULT_MEDIUM: Record<WaveVariant, WaveMedium> = { transverse: 'rope', longitudinal: 'spring', sound: 'air', echo: 'air' };

/** Lenient: bad values → defaults; the missing one of λ, ν, v follows from v = λν. */
export function parseWavesParams(raw: unknown): WavesParams {
  const p = obj(raw);
  const variant = enumOr(p.variant, WAVE_VARIANTS, 'transverse');
  const medium = enumOr(p.medium, WAVE_MEDIA, DEFAULT_MEDIUM[variant]);
  const amplitude = numOr(p.amplitude, 0, 100, 0.3);
  const distance = numOr(p.distance, 0.1, 1e5, 170);
  const gl = numOr(p.wavelength, 1e-6, 1e6, NaN);
  const gf = numOr(p.frequency, 1e-4, 1e7, NaN);
  const gv = numOr(p.speed, 1e-6, 1e8, NaN);
  const has = Number.isFinite;
  let wavelength: number;
  let frequency: number;
  let speed: number;
  if (variant === 'sound' || variant === 'echo') {
    speed = has(gv) ? gv : medium === 'water' ? SOUND_SPEED.water : SOUND_SPEED.air;
    if (has(gf)) frequency = gf;
    else if (has(gl)) frequency = speed / gl;
    else frequency = DEFAULT_SOUND_FREQUENCY;
    wavelength = speed / frequency;
  } else if (has(gl) && has(gf)) {
    wavelength = gl;
    frequency = gf;
    speed = gl * gf;
  } else if (has(gv)) {
    frequency = has(gf) ? gf : has(gl) ? gv / gl : 1;
    wavelength = gv / frequency;
    speed = gv;
  } else {
    wavelength = has(gl) ? gl : 2;
    frequency = has(gf) ? gf : 1;
    speed = wavelength * frequency;
  }
  return { variant, medium, amplitude, wavelength, frequency, speed, distance };
}
export const DEFAULT_WAVES: WavesParams = parseWavesParams({});

/** Period T = 1/ν, s. */
export const wavePeriod = (frequency: number) => 1 / frequency;
/** Echo delay t = 2s/v, s. */
export const echoTime = (distance: number, speed: number) => (2 * distance) / speed;

/**
 * Displacement of the particle at distance `x` from the source at time `t`:
 * A·sin(2π(x/λ − νt)) once the front (x = λνt) has passed it, else 0.
 */
export function waveDisplacement(x: number, t: number, amplitude: number, wavelength: number, frequency: number): number {
  if (t <= 0 || x > wavelength * frequency * t) return 0;
  return amplitude * Math.sin(2 * Math.PI * (x / wavelength - frequency * t));
}
/** Particle velocity ∂y/∂t = −2πνA·cos(2π(x/λ − νt)) behind the front, else 0. */
export function waveVelocity(x: number, t: number, amplitude: number, wavelength: number, frequency: number): number {
  if (t <= 0 || x > wavelength * frequency * t) return 0;
  return -2 * Math.PI * frequency * amplitude * Math.cos(2 * Math.PI * (x / wavelength - frequency * t));
}

/**
 * Positions (from the source) of a wave feature that sits at phase
 * x/λ − νt = c + n: crests c = ¼ (transverse), compressions c = ½.
 * Returns the one in [lo, lo + λ).
 */
export function featureAt(t: number, wavelength: number, frequency: number, c: number, lo = 0): number {
  const base = wavelength * (frequency * t + c);
  const n = Math.ceil((lo - base) / wavelength - 1e-9);
  return base + n * wavelength;
}

/** How the scene draws the wave: scene λ and A, the drawn frequency and the slow-down. */
export interface WaveView {
  lam: number;
  amp: number;
  nu: number;
  /** Real ν / drawn ν (> 1: slowed down). */
  slow: number;
  /** Scene units per metre of the real wave. */
  k: number;
}

const ROPE = 6;
const X0 = -ROPE / 2;
const Y0 = 1.3;
export const BEADS = 40;
const DX = ROPE / (BEADS - 1);

export function waveView(p: WavesParams): WaveView {
  if (p.variant === 'sound') {
    const lam = clamp(p.wavelength, 0.6, 2.4);
    const loud = clamp(p.amplitude / 0.3, 0.2, 1.25);
    const nu = 0.8;
    return { lam, amp: 0.12 * lam * loud, nu, slow: p.frequency / nu, k: lam / p.wavelength };
  }
  // At least one whole λ always fits on the rope, and ≥ 8 beads per λ.
  const lam = clamp(p.wavelength, 1.6, ROPE / 2);
  const k = lam / p.wavelength;
  const amp = p.variant === 'longitudinal'
    ? Math.min(p.amplitude * k, (0.6 * lam) / (2 * Math.PI)) // neighbours never pass each other
    : Math.min(p.amplitude * k, 1.1);
  const nu = clamp(p.frequency, 0.05, 1.5);
  return { lam, amp, nu, slow: p.frequency / nu, k };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const HZ = L('Гц', 'Гц', 'Hz');
const u = (s: string, lang: Lang) => (s === 'Hz' ? tr(HZ, lang) : unit(s, lang));
/** Three significant figures (0,75 · 1,03 · 440 · 0,00227). */
export function num(n: number, lang: Lang = 'ru'): string {
  if (n === 0 || !Number.isFinite(n)) return fmt(0, 0, lang);
  const digits = clamp(2 - Math.floor(Math.log10(Math.abs(n))), 0, 7);
  return fmt(n, digits, lang);
}
const q = (n: number, s: string, lang: Lang) => `${num(n, lang)} ${u(s, lang)}`;

const T_ = {
  transverse: L('Туурасынан толкун', 'Поперечная волна', 'Transverse wave'),
  longitudinal: L('Узатасынан толкун', 'Продольная волна', 'Longitudinal wave'),
  sound: L('Үн толкундары', 'Звуковые волны', 'Sound waves'),
  echo: L('Жаңырык', 'Эхо', 'Echo'),
  compression: L('кысылуу', 'сжатие', 'compression'),
  rarefaction: L('сийрелүү', 'разрежение', 'rarefaction'),
  heard: L('Жаңырык!', 'Эхо!', 'Echo!'),
  merges: L('t < 1/15 с — жаңырык өзүнчө угулбайт', 't < 1/15 с — эхо не слышно отдельно', 't < 1/15 s — the echo merges with the sound'),
  slowed: L('жайлатылып көрсөтүлдү', 'показано замедленно', 'shown slowed down'),
  sped: L('тездетилип көрсөтүлдү', 'показано ускоренно', 'shown sped up'),
};

/** Readout lines for the scene (also used by tests). */
export function wavesReadout(p: WavesParams, lang: Lang = 'ru'): string[] {
  const head = tr(T_[p.variant], lang);
  const T = wavePeriod(p.frequency);
  if (p.variant === 'echo') {
    const t = echoTime(p.distance, p.speed);
    const lines = [head, `s = ${q(p.distance, 'm', lang)}`, `v = ${q(p.speed, 'm/s', lang)}`, `t = 2s/v = ${q(t, 's', lang)}`];
    if (t < ECHO_MIN_DELAY) lines.push(tr(T_.merges, lang));
    return lines;
  }
  if (p.variant === 'sound') {
    return [head, `ν = ${q(p.frequency, 'Hz', lang)}`, `T = 1/ν = ${q(T, 's', lang)}`, `v = ${q(p.speed, 'm/s', lang)}`, `λ = v/ν = ${q(p.wavelength, 'm', lang)}`];
  }
  return [head, `λ = ${q(p.wavelength, 'm', lang)}`, `A = ${q(p.amplitude, 'm', lang)}`, `ν = ${q(p.frequency, 'Hz', lang)}`, `T = 1/ν = ${q(T, 's', lang)}`, `v = λν = ${q(p.speed, 'm/s', lang)}`];
}

function slowNote(p: WavesParams, v: WaveView, lang: Lang): string | null {
  if (Math.abs(v.slow - 1) < 1e-6) return null;
  return `${tr(v.slow > 1 ? T_.slowed : T_.sped, lang)}: ${q(p.frequency, 'Hz', lang)} → ${q(v.nu, 'Hz', lang)}`;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const SKIN = '#f1c27d';
const MARK = '#ffd166';
const AMP = '#f15bb5';
const TRACE = '#80ffdb';
const RED = '#e63946';

/** A tube along +X from its group origin whose length follows `len(t)`; the group turns by `angle(t)`. */
function stretchTube(name: string, parent: string, radius: number, color: string, at: (t: number) => { pos: Vec3; angle: number; len: number }, extra: Partial<Part> = {}): Part[] {
  const s0 = at(0);
  return [
    { name, parent, shape: { kind: 'group' }, position: s0.pos, rotation: [0, 0, s0.angle], noPick: true, motion: (t) => { const s = at(t); return { position: s.pos, rotation: [0, 0, s.angle] }; } },
    {
      name: `${name}_Tube`, parent: name, shape: { kind: 'tube', from: [0, 0, 0], to: [1, 0, 0], radius }, color, ...extra,
      motion: (t) => { const l = Math.max(1e-3, at(t).len); return { scale: [1, l, 1], position: [l / 2, 0, 0] }; },
    },
  ];
}

/** Dimension line of length `len` along +X (ends drop by `drop`), in its own group. */
function dimension(name: string, len: number, color: string, drop: number, o: { parent?: string; position?: Vec3; motion?: Part['motion']; label?: string; below?: boolean } = {}): Part[] {
  const parts: Part[] = [
    { name, parent: o.parent, shape: { kind: 'group' }, position: o.position, motion: o.motion },
    { name: `${name}_Line`, parent: name, shape: { kind: 'tube', from: [0, 0, 0], to: [Math.max(1e-3, len), 0, 0], radius: 0.014 }, color, material: 'emissive', glow: 1 },
    { name: `${name}_End_1`, parent: name, shape: { kind: 'tube', from: [0, 0.06, 0], to: [0, -drop, 0], radius: 0.01 }, color, material: 'emissive', glow: 0.8 },
    { name: `${name}_End_2`, parent: name, shape: { kind: 'tube', from: [len, 0.06, 0], to: [len, -drop, 0], radius: 0.01 }, color, material: 'emissive', glow: 0.8 },
  ];
  if (o.label) parts.push(text(`${name}_Label`, o.label, [len / 2, o.below ? -0.2 : 0.2, 0], 0.15, { parent: name, color, bold: true }));
  return parts;
}

/** Ground board (decoration). */
const ground = (w: number, d: number, color = '#3d4654'): Part => ({ name: 'Ground', shape: { kind: 'box', size: [w, 0.04, d], bevel: 0.015 }, position: [0, -0.02, 0], color, material: 'matte', noPick: true });

/** Arrow along local +Y (vertical) or +X (horizontal) whose length and direction follow `val(t)` (scene units). */
function varArrow(name: string, parent: string | undefined, horizontal: boolean, color: string, pos: (t: number) => Vec3, val: (t: number) => number): Part[] {
  return [
    {
      name, parent, shape: { kind: 'group' }, position: pos(0), noPick: true,
      motion: (t) => { const v = val(t); return { position: pos(t), rotation: [0, 0, v < 0 ? Math.PI : 0], visible: Math.abs(v) > 0.02 }; },
    },
    {
      name: `${name}_Shaft`, parent: name, shape: { kind: 'arrow', from: [0, 0, 0], vector: horizontal ? [1, 0, 0] : [0, 1, 0], radius: 0.02 }, color, ...arrowLook,
      motion: (t) => ({ scale: [1, Math.max(1e-3, Math.abs(val(t))), 1] }),
    },
  ];
}

/**
 * Trace: the crest (or compression) born at the source is followed along
 * the medium; dots mark every λ/2 it has passed (equal steps in equal times).
 * `c`: the feature's phase (¼ crest, ½ compression); `len`: path length.
 */
function traceParts(len: number, v: WaveView, c: number, at: (x: number) => Vec3, color = TRACE): Part[] {
  const vs = v.lam * v.nu;
  const birth = (((1 - c) % 1) + 1) % 1 / v.nu;
  const cycle = Math.ceil((len / vs) * v.nu + 0.5) / v.nu;
  const xOf = (t: number) => (t < birth ? -1 : vs * ((t - birth) % cycle));
  const parts: Part[] = [{
    name: 'Crest', shape: { kind: 'sphere', radius: 0.07, widthSegments: 16 }, position: at(0), color, material: 'emissive', glow: 1.3, halo: { color, size: 0.4, strength: 0.5 }, noPick: true,
    motion: (t) => { const x = xOf(t); return { position: at(Math.max(0, x)), visible: x >= 0 && x <= len }; },
  }];
  for (let i = 1; i * (v.lam / 2) <= len + 1e-9; i++) {
    const xi = i * (v.lam / 2);
    parts.push({
      name: `Trace_${i}`, shape: { kind: 'sphere', radius: 0.035, widthSegments: 12 }, position: at(xi), color, material: 'emissive', glow: 1, noPick: true,
      motion: (t) => ({ visible: xOf(t) >= xi - 1e-6 }),
    });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Rope and spring (transverse / longitudinal)
// ---------------------------------------------------------------------------

function mediumLook(m: WaveMedium) {
  switch (m) {
    case 'rope': return { bead: '#f4a261', link: '#9c6b43', ring: false };
    case 'spring': return { bead: COLORS.steel, link: COLORS.steel, ring: true };
    case 'water': return { bead: '#9bd1ff', link: '', ring: false };
    default: return { bead: '#a9c6e8', link: '', ring: false };
  }
}

function buildChain(p: WavesParams, v: WaveView, modes: Record<string, boolean | string>, lang: Lang): Part[] {
  const transverse = p.variant === 'transverse';
  const labels = on(modes, 'labels');
  const look = mediumLook(p.medium);
  const front = (t: number) => v.lam * v.nu * t;
  const disp = (x: number, t: number) => waveDisplacement(x, t, v.amp, v.lam, v.nu);
  const vel = (x: number, t: number) => waveVelocity(x, t, v.amp, v.lam, v.nu);
  const home = (i: number) => i * DX;
  /** World position of bead i. */
  const bead = (i: number, t: number): Vec3 => {
    const x = home(i);
    const d = disp(x, t);
    return transverse ? [X0 + x, Y0 + d, 0] : [X0 + x + d, Y0, 0];
  };
  const TRACER = 19; // Bead_20, drawn red: it only swings about its place
  const parts: Part[] = [ground(ROPE + 2.2, 1.6), { name: 'Medium', shape: { kind: 'group' } }];
  if (p.medium === 'water') {
    parts.push({ name: 'Medium_Water', parent: 'Medium', shape: { kind: 'box', size: [ROPE + 0.4, Y0, 1.2] }, position: [0, Y0 / 2, 0], color: COLORS.water, opacity: 0.35, container: true });
  }
  for (let i = 0; i < BEADS; i++) {
    const color = i === TRACER ? RED : look.bead;
    const shape: Part['shape'] = look.ring ? { kind: 'torus', radius: transverse ? 0.16 : 0.24, tube: 0.022, segments: 32 } : { kind: 'sphere', radius: 0.085, widthSegments: 18 };
    parts.push({
      name: `Bead_${i + 1}`, parent: 'Medium', shape, position: bead(i, 0), rotation: look.ring ? [0, Math.PI / 2, 0] : undefined,
      color, material: look.ring ? 'metal' : 'plastic', motion: (t) => ({ position: bead(i, t) }),
    });
  }
  // Links between the beads: a rope (transverse) or little springs (beads model, §54 fig. 139).
  if (look.link) {
    for (let i = 0; i < BEADS - 1; i++) {
      parts.push(...stretchTube(`Medium_Link_${i + 1}`, 'Medium', look.ring ? 0.01 : transverse ? 0.025 : 0.012, look.link, (t) => {
        const a = bead(i, t);
        const b = bead(i + 1, t);
        return { pos: a, angle: Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
      }, { material: look.ring ? 'metal' : 'matte', noPick: true }));
    }
  }
  // The hand that makes the wave.
  const handAt = (t: number): Vec3 => (transverse ? [X0 - 0.2, Y0 + disp(0, t), 0] : [X0 - 0.3 + disp(0, t), Y0, 0]);
  parts.push({ name: 'Source', shape: { kind: 'group' }, position: handAt(0), motion: (t) => ({ position: handAt(t) }) });
  if (transverse) {
    parts.push({ name: 'Source_Fist', parent: 'Source', shape: { kind: 'sphere', radius: 0.14, widthSegments: 24 }, scale: [1.1, 0.9, 1], color: SKIN, material: 'matte' });
  } else {
    parts.push({ name: 'Source_Plate', parent: 'Source', shape: { kind: 'box', size: [0.05, 0.62, 0.62], bevel: 0.015 }, position: [0.06, 0, 0], color: '#8892a0', material: 'metal' });
    parts.push({ name: 'Source_Fist', parent: 'Source', shape: { kind: 'sphere', radius: 0.12, widthSegments: 24 }, position: [-0.14, 0, 0], color: SKIN, material: 'matte' });
  }
  parts.push({ name: 'Source_Arm', parent: 'Source', shape: { kind: 'capsule', radius: 0.075, length: 0.55 }, position: [-0.5, -0.05, 0], rotation: [0, 0, Math.PI / 2 - 0.15], color: '#3a86ff', material: 'matte' });

  if (transverse) {
    // Rest line of the rope.
    parts.push({ name: 'Equilibrium', shape: { kind: 'tube', from: [X0, Y0, -0.02], to: [X0 + ROPE, Y0, -0.02], radius: 0.008 }, color: COLORS.axis, opacity: 0.45, container: true });
    // λ between two crests and A at the first one, riding on the wave.
    const crest = (t: number) => featureAt(t, v.lam, v.nu, 0.25, 0);
    const top = Y0 + v.amp + 0.3;
    parts.push(...dimension('Marker_Wavelength', v.lam, MARK, 0.3 - 0.09, {
      position: [X0, top, 0], label: labels ? `λ = ${q(p.wavelength, 'm', lang)}` : 'λ',
      motion: (t) => { const x = crest(t); return { position: [X0 + x, top, 0], visible: front(t) >= x + v.lam - 1e-6 }; },
    }));
    const ampAt = (t: number): Vec3 => [X0 + crest(t) + 0.13, Y0, 0.05];
    parts.push({ name: 'Marker_Amplitude', shape: { kind: 'group' }, position: ampAt(0), motion: (t) => ({ position: ampAt(t), visible: front(t) >= crest(t) + v.lam - 1e-6 }) });
    parts.push({ name: 'Marker_Amplitude_Line', parent: 'Marker_Amplitude', shape: { kind: 'tube', from: [0, 0, 0], to: [0, Math.max(1e-3, v.amp), 0], radius: 0.014 }, color: AMP, material: 'emissive', glow: 1 });
    parts.push({ name: 'Marker_Amplitude_End_1', parent: 'Marker_Amplitude', shape: { kind: 'box', size: [0.12, 0.014, 0.014] }, color: AMP, material: 'emissive', glow: 1 });
    parts.push({ name: 'Marker_Amplitude_End_2', parent: 'Marker_Amplitude', shape: { kind: 'box', size: [0.12, 0.014, 0.014] }, position: [0, v.amp, 0], color: AMP, material: 'emissive', glow: 1 });
    parts.push(text('Marker_Amplitude_Label', labels ? `A = ${q(p.amplitude, 'm', lang)}` : 'A', [0.12, v.amp / 2, 0], 0.15, { parent: 'Marker_Amplitude', color: AMP, bold: true, align: 'left' }));
  } else {
    // Compressions (dense) and rarefactions (sparse), moving with the wave.
    const n = Math.ceil(ROPE / v.lam) + 1;
    const band = (kind: 'Compression' | 'Rarefaction', c: number, color: string, opacity: number) => {
      for (let j = 0; j < n; j++) {
        const xAt = (t: number) => featureAt(t, v.lam, v.nu, c, 0) + j * v.lam;
        parts.push({
          name: `${kind}_${j + 1}`, shape: { kind: 'box', size: [Math.min(0.5, v.lam * 0.22), 0.78, 0.78] }, position: [X0, Y0, 0], color, opacity, container: true,
          motion: (t) => { const x = xAt(t); return { position: [X0 + x, Y0, 0], visible: x <= ROPE && x <= front(t) }; },
        });
        if (labels && j === 0) parts.push(text(`${kind}_${j + 1}_Label`, tr(kind === 'Compression' ? T_.compression : T_.rarefaction, lang), [0, kind === 'Compression' ? 0.62 : -0.62, 0], 0.13, { parent: `${kind}_${j + 1}`, color }));
      }
    };
    band('Compression', 0.5, '#4cc9f0', 0.22);
    band('Rarefaction', 0, '#ffd166', 0.1);
    const comp = (t: number) => featureAt(t, v.lam, v.nu, 0.5, 0);
    const y = Y0 - 0.65;
    parts.push(...dimension('Marker_Wavelength', v.lam, MARK, 0.12, {
      position: [X0, y, 0.3], below: true, label: labels ? `λ = ${q(p.wavelength, 'm', lang)}` : 'λ',
      motion: (t) => { const x = comp(t); return { position: [X0 + x, y, 0.3], visible: front(t) >= x + v.lam - 1e-6 }; },
    }));
    // The red bead swings ±A about its own place.
    const hx = X0 + home(TRACER);
    parts.push(...dimension('Marker_Amplitude', 2 * Math.max(1e-3, v.amp), AMP, 0.08, { position: [hx - v.amp, Y0 + 0.45, 0], label: labels ? `2A = ${q(2 * p.amplitude, 'm', lang)}` : '2A' }));
  }

  if (on(modes, 'vectors')) {
    // Particle velocities: across the rope (transverse) or along it (longitudinal); the wave runs along +x.
    const s = 0.6 / Math.max(1e-6, 2 * Math.PI * v.nu * v.amp);
    for (let i = 1; i < BEADS; i += 4) {
      const off = transverse ? [0, 0, 0.12] : [0, 0.32, 0];
      parts.push(...varArrow(`Arrow_Bead_${i + 1}`, undefined, !transverse, COLORS.velocity, (t) => {
        const b = bead(i, t);
        return [b[0] + off[0], b[1] + off[1], b[2] + off[2]];
      }, (t) => (v.amp > 0 ? vel(home(i), t) * s : 0)));
    }
    const ay = transverse ? Y0 + v.amp + 0.85 : Y0 + 0.95;
    parts.push({ name: 'Arrow_Wave', shape: { kind: 'arrow', from: [-0.8, ay, 0], vector: [1.6, 0, 0], radius: 0.03 }, color: '#06d6a0', ...arrowLook });
    parts.push(text('Arrow_Wave_Label', labels ? `v = ${q(p.speed, 'm/s', lang)}` : 'v', [0, ay + 0.22, 0], 0.15, { color: '#06d6a0', bold: true }));
  }
  if (on(modes, 'trace')) {
    const c = transverse ? 0.25 : 0.5;
    parts.push(...traceParts(ROPE, v, c, (x) => (transverse ? [X0 + x, Y0 + v.amp + 0.12, 0.05] : [X0 + x, Y0 - 0.38, 0.3])));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Sound: tuning fork, air, ear
// ---------------------------------------------------------------------------

const FX = -2.9;
const FY = 1.05;
const R_MIN = 0.45;
const R_MAX = 6.1;

function buildSound(p: WavesParams, v: WaveView, modes: Record<string, boolean | string>, lang: Lang): Part[] {
  const labels = on(modes, 'labels');
  const vs = v.lam * v.nu;
  const front = (t: number) => vs * t;
  const ampAt = (r: number) => v.amp / Math.sqrt(1 + r / 3);
  const disp = (r: number, t: number) => waveDisplacement(r, t, ampAt(r), v.lam, v.nu);
  const parts: Part[] = [ground(7.8, 2.2)];
  // Tuning fork on its resonance box, the prongs swing apart and together.
  parts.push({ name: 'Source', shape: { kind: 'group' }, position: [FX, 0, 0] });
  parts.push({ name: 'Source_Box', parent: 'Source', shape: { kind: 'box', size: [0.9, 0.3, 0.42], bevel: 0.02 }, position: [0, 0.15, 0], color: '#e9c891', material: 'wood', textureScale: 2 });
  parts.push({ name: 'Source_Box_Mouth', parent: 'Source', shape: { kind: 'box', size: [0.01, 0.22, 0.34] }, position: [0.451, 0.15, 0], color: '#2b2118', noPick: true });
  parts.push({ name: 'Source_Stem', parent: 'Source', shape: { kind: 'cylinder', radiusTop: 0.025, radiusBottom: 0.03, height: 0.22, segments: 16 }, position: [0, 0.41, 0], color: COLORS.steel, material: 'metal' });
  parts.push({ name: 'Source_Bend', parent: 'Source', shape: { kind: 'torus', radius: 0.1, tube: 0.026, arc: Math.PI, segments: 24 }, position: [0, 0.6, 0], rotation: [0, 0, Math.PI], color: COLORS.steel, material: 'metal' });
  const swing = (t: number) => 0.022 * Math.sin(2 * Math.PI * v.nu * t);
  for (const [i, sgn] of [[1, -1], [2, 1]] as const) {
    parts.push({
      name: `Source_Prong_${i}`, parent: 'Source', shape: { kind: 'box', size: [0.05, 0.8, 0.05], bevel: 0.012 }, position: [sgn * 0.1, 1.0, 0], color: COLORS.steel, material: 'metal',
      motion: (t) => ({ position: [sgn * (0.1 + swing(t)), 1.0, 0] }),
    });
  }
  // Air: a jittered grid of particles in two layers, pushed radially from the fork.
  const rand = rng(5455);
  const homes: Vec3[] = [];
  const dirs: Vec3[] = [];
  const rs: number[] = [];
  const nx = 25;
  const ny = 10;
  for (const z of [-0.28, 0.12]) {
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        const x = FX - 0.6 + (ix + 0.5 + (rand() - 0.5) * 0.7) * (6.3 / nx);
        const y = 0.12 + (iy + 0.5 + (rand() - 0.5) * 0.7) * (2.8 / ny);
        const dx = x - FX;
        const dy = y - FY;
        const r = Math.hypot(dx, dy, z);
        const inBox = Math.abs(dx) < 0.5 && y < 0.36;
        if (r < R_MIN || inBox) continue;
        homes.push([x, y, z]);
        dirs.push([dx / r, dy / r, z / r]);
        rs.push(r);
      }
    }
  }
  parts.push({ name: 'Medium', shape: { kind: 'group' } });
  parts.push({
    name: 'Air_Particles', parent: 'Medium', shape: { kind: 'instances', positions: homes, radius: 0.034 }, color: '#a9c6e8', material: 'plastic',
    instanceMotion: (t, i) => {
      const d = disp(rs[i], t);
      const h = homes[i];
      const e = dirs[i];
      return [h[0] + d * e[0], h[1] + d * e[1], h[2] + d * e[2]];
    },
  });
  // Three red particles on the axis: each only swings about its place.
  const tracerR = [1.3, 2.7, 4.1];
  const tracer = (j: number, t: number): Vec3 => [FX + tracerR[j] + disp(tracerR[j], t), FY, 0.32];
  tracerR.forEach((_, j) => {
    parts.push({ name: `Air_Tracer_${j + 1}`, parent: 'Medium', shape: { kind: 'sphere', radius: 0.055, widthSegments: 16 }, position: tracer(j, 0), color: RED, material: 'plastic', motion: (t) => ({ position: tracer(j, t) }) });
  });
  // Compression fronts: arcs spreading from the fork.
  const ARC = 0.7;
  const n = Math.ceil((R_MAX - R_MIN) / v.lam) + 1;
  for (let j = 0; j < n; j++) {
    const rAt = (t: number) => featureAt(t, v.lam, v.nu, 0.5, R_MIN) + j * v.lam;
    parts.push({
      name: `Compression_${j + 1}`, shape: { kind: 'torus', radius: 1, tube: 0.008, arc: ARC, segments: 32 }, position: [FX, FY, 0.42], rotation: [0, 0, -ARC / 2],
      color: '#4cc9f0', material: 'emissive', glow: 0.9, opacity: 0.7, noPick: true,
      motion: (t) => { const r = rAt(t); return { scale: [r, r, 1], visible: r <= R_MAX && r <= front(t) }; },
    });
  }
  if (labels) {
    parts.push(text('Compression_Label', tr(T_.compression, lang), [FX + 1.6, FY + 0.95, 0.42], 0.13, { color: '#4cc9f0' }));
  }
  // λ between two neighbouring compressions on the axis.
  const comp = (t: number) => featureAt(t, v.lam, v.nu, 0.5, 1);
  const my = FY - 0.75;
  parts.push(...dimension('Marker_Wavelength', v.lam, MARK, 0.12, {
    position: [FX + 1, my, 0.42], below: true, label: labels ? `λ = ${q(p.wavelength, 'm', lang)}` : 'λ',
    motion: (t) => { const x = comp(t); return { position: [FX + x, my, 0.42], visible: front(t) >= x + v.lam - 1e-6 }; },
  }));
  // The ear at the right: its drum shakes once the sound has come.
  const EX = 3.35;
  const er = EX - 0.3 - FX;
  parts.push({ name: 'Ear', shape: { kind: 'group' }, position: [EX, FY, 0] });
  parts.push({ name: 'Ear_Head', parent: 'Ear', shape: { kind: 'sphere', radius: 0.3, widthSegments: 28 }, color: SKIN, material: 'matte' });
  parts.push({ name: 'Ear_Shell', parent: 'Ear', shape: { kind: 'torus', radius: 0.11, tube: 0.04, arc: Math.PI * 1.6, segments: 24 }, position: [-0.29, 0.02, 0], rotation: [0, Math.PI / 2, 0.6], color: '#e0a96d', material: 'matte' });
  parts.push({
    name: 'Ear_Drum', parent: 'Ear', shape: { kind: 'sphere', radius: 0.045, widthSegments: 12 }, position: [-0.3, 0.02, 0], color: '#5a3825',
    motion: (t) => ({ position: [-0.3 + 1.5 * disp(er, t), 0.02, 0] }),
  });
  if (on(modes, 'vectors')) {
    const s = 0.5 / Math.max(1e-6, 2 * Math.PI * v.nu * v.amp);
    tracerR.forEach((r, j) => {
      parts.push(...varArrow(`Arrow_Air_${j + 1}`, undefined, true, COLORS.velocity, (t) => {
        const b = tracer(j, t);
        return [b[0], b[1] + 0.2, b[2]];
      }, (t) => waveVelocity(r, t, ampAt(r), v.lam, v.nu) * s));
    });
    const ay = FY + 1.75;
    parts.push({ name: 'Arrow_Wave', shape: { kind: 'arrow', from: [-0.8, ay, 0], vector: [1.6, 0, 0], radius: 0.03 }, color: '#06d6a0', ...arrowLook });
    parts.push(text('Arrow_Wave_Label', labels ? `v = ${q(p.speed, 'm/s', lang)}` : 'v', [0, ay + 0.22, 0], 0.15, { color: '#06d6a0', bold: true }));
  }
  if (on(modes, 'trace')) parts.push(...traceParts(EX - 0.35 - FX, v, 0.5, (x) => [FX + x, FY - 0.3, 0.42]));
  return parts;
}

// ---------------------------------------------------------------------------
// Echo: a pulse to the cliff and back
// ---------------------------------------------------------------------------

const EW = 7.2;
const ES = -EW / 2;
const EC = EW / 2;
const EY = 1.25;
/** The round trip lasts this long on the free clock (slowed or sped up), then a pause. */
const ECHO_PLAY = 5;
const ECHO_PAUSE = 1.6;

function buildEcho(p: WavesParams, modes: Record<string, boolean | string>, lang: Lang): Part[] {
  const labels = on(modes, 'labels');
  const T = echoTime(p.distance, p.speed);
  const vs = (2 * EW) / T; // scene units per second of model time
  /** Front of the outgoing pulse (t ≤ T/2) or of the echo (t > T/2), scene x. */
  const outX = (t: number) => ES + vs * clamp(t, 0, T / 2);
  const backX = (t: number) => EC - vs * clamp(t - T / 2, 0, T / 2);
  const parts: Part[] = [ground(EW + 3, 2.6, '#55654a')];
  // The cliff.
  parts.push({ name: 'Wall', shape: { kind: 'group' }, position: [EC, 0, 0] });
  parts.push({ name: 'Wall_Face', parent: 'Wall', shape: { kind: 'box', size: [1.2, 3.4, 2.4], bevel: 0.08 }, position: [0.6, 1.7, 0], color: '#8a7f72', material: 'matte' });
  ([[0.35, 3.45, 0.3, 0.55], [0.8, 3.3, -0.6, 0.5], [0.25, 0.5, 0.9, 0.45], [0.7, 2.2, 1.0, 0.4]] as const).forEach(([x, y, z, r], i) => {
    parts.push({ name: `Wall_Rock_${i + 1}`, parent: 'Wall', shape: { kind: 'icosahedron', radius: r, detail: 0 }, position: [x, y, z], rotation: [i, i * 0.7, 0], color: i % 2 ? '#7a6f63' : '#978b7d', material: 'matte' });
  });
  // The person who shouts, and their ear.
  const sx = ES - 0.25;
  parts.push({ name: 'Source', shape: { kind: 'group' }, position: [sx, 0, 0] });
  parts.push({ name: 'Source_Body', parent: 'Source', shape: { kind: 'capsule', radius: 0.17, length: 0.5 }, position: [0, 0.82, 0], color: '#3a86ff', material: 'matte' });
  parts.push({ name: 'Source_Leg_1', parent: 'Source', shape: { kind: 'capsule', radius: 0.07, length: 0.45 }, position: [0, 0.3, 0.09], color: '#2b2d42', material: 'matte' });
  parts.push({ name: 'Source_Leg_2', parent: 'Source', shape: { kind: 'capsule', radius: 0.07, length: 0.45 }, position: [0, 0.3, -0.09], color: '#2b2d42', material: 'matte' });
  parts.push({ name: 'Source_Head', parent: 'Source', shape: { kind: 'sphere', radius: 0.16, widthSegments: 24 }, position: [0, EY, 0], color: SKIN, material: 'matte' });
  parts.push({ name: 'Source_Horn', parent: 'Source', shape: { kind: 'cylinder', radiusTop: 0.13, radiusBottom: 0.04, height: 0.28, segments: 24, openEnded: true }, position: [0.27, EY - 0.02, 0], rotation: [0, 0, -Math.PI / 2], color: '#ff8c42', material: 'plastic' });
  const heard = (t: number) => t >= T - 1e-9;
  parts.push({
    name: 'Ear', shape: { kind: 'group' }, position: [sx, EY + 0.02, 0.16],
    motion: (t) => { const k = heard(t) ? 1.3 : 1; return { scale: [k, k, k] }; },
  });
  parts.push({ name: 'Ear_Shell', parent: 'Ear', shape: { kind: 'torus', radius: 0.06, tube: 0.022, arc: Math.PI * 1.6, segments: 20 }, rotation: [0, 0, 0.6], color: '#e0a96d', material: 'matte' });
  parts.push({ name: 'Ear_Glow', parent: 'Ear', shape: { kind: 'sphere', radius: 0.03, widthSegments: 12 }, color: '#ffd166', material: 'emissive', glow: 1.4, halo: { color: '#ffd166', size: 0.5, strength: 0.7 }, noPick: true, motion: (t) => ({ visible: heard(t) }) });
  parts.push(text('Echo_Heard', tr(T_.heard, lang), [sx, EY + 0.55, 0.2], 0.17, { color: '#ffd166', bold: true, motion: (t) => ({ visible: heard(t) }) }));
  // Air particles: the pulse pushes them on (a compression runs through), the echo back.
  const rand = rng(5656);
  const homes: Vec3[] = [];
  for (let ix = 0; ix < 52; ix++) {
    for (const y of [0.65, 1.25, 1.85]) {
      for (const z of [-0.25, 0.2]) homes.push([ES + 0.35 + (ix + 0.5 + (rand() - 0.5) * 0.6) * ((EW - 0.4) / 52), y + (rand() - 0.5) * 0.18, z + (rand() - 0.5) * 0.18]);
    }
  }
  const W = 0.35;
  const bump = (d: number) => Math.exp(-(d * d) / (W * W));
  parts.push({ name: 'Medium', shape: { kind: 'group' } });
  parts.push({
    name: 'Air_Particles', parent: 'Medium', shape: { kind: 'instances', positions: homes, radius: 0.03 }, color: '#a9c6e8', material: 'plastic',
    instanceMotion: (t, i) => {
      const h = homes[i];
      let d = 0;
      if (t > 0 && t < T / 2) d = 0.14 * bump(h[0] - outX(t) + W);
      else if (t >= T / 2 && t <= T) d = -0.09 * bump(h[0] - backX(t) - W);
      return [h[0] + d, h[1], h[2]];
    },
  });
  // Wave fronts of the pulse (three arcs) out and back.
  const R = 1.1;
  const arcs = (name: string, back: boolean) => {
    const xAt = (t: number) => (back ? backX(t) + R : outX(t) - R);
    const live = (t: number) => (back ? t >= T / 2 && t <= T : t > 0 && t < T / 2);
    parts.push({ name, shape: { kind: 'group' }, position: [xAt(0), EY, 0], rotation: [0, 0, back ? Math.PI : 0], noPick: true, motion: (t) => ({ position: [xAt(t), EY, 0], visible: live(t) }) });
    for (let j = 0; j < 3; j++) {
      parts.push({
        name: `${name}_Arc_${j + 1}`, parent: name, shape: { kind: 'torus', radius: R - j * 0.13, tube: 0.022, arc: 0.9, segments: 24 }, rotation: [0, 0, -0.45],
        color: back ? '#4cc9f0' : '#ff8c42', material: 'emissive', glow: 1.1, opacity: back ? 0.65 - j * 0.15 : 0.9 - j * 0.2,
      });
    }
  };
  arcs('Pulse_Out', false);
  arcs('Pulse_Back', true);
  // Distance s from the person to the cliff.
  parts.push(...dimension('Marker_Distance', EW, MARK, 0.1, { position: [ES, 0.12, 1.05], label: labels ? `s = ${q(p.distance, 'm', lang)}` : 's' }));
  // Stopwatch: the hand runs while the sound travels, stops when the echo comes.
  const dial = Math.max(1e-3, T * 1.25);
  parts.push({ name: 'Stopwatch', shape: { kind: 'group' }, position: [0, 3.05, 0] });
  parts.push({ name: 'Stopwatch_Case', parent: 'Stopwatch', shape: { kind: 'cylinder', radiusTop: 0.3, radiusBottom: 0.3, height: 0.08, segments: 48 }, rotation: [Math.PI / 2, 0, 0], color: COLORS.steel, material: 'metal' });
  parts.push({ name: 'Stopwatch_Face', parent: 'Stopwatch', shape: { kind: 'cylinder', radiusTop: 0.26, radiusBottom: 0.26, height: 0.01, segments: 48 }, position: [0, 0, 0.042], rotation: [Math.PI / 2, 0, 0], color: '#f8f9fa', material: 'matte' });
  parts.push({ name: 'Stopwatch_Crown', parent: 'Stopwatch', shape: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.04, height: 0.08, segments: 16 }, position: [0, 0.34, 0], color: COLORS.steel, material: 'metal' });
  parts.push({ name: 'Stopwatch_Mark', parent: 'Stopwatch', shape: { kind: 'box', size: [0.014, 0.07, 0.006] }, position: [Math.sin((T / dial) * Math.PI * 2) * 0.21, Math.cos((T / dial) * Math.PI * 2) * 0.21, 0.05], rotation: [0, 0, -(T / dial) * Math.PI * 2], color: RED, noPick: true });
  parts.push({ name: 'Stopwatch_HandAt', parent: 'Stopwatch', shape: { kind: 'group' }, position: [0, 0, 0.056], noPick: true, motion: (t) => ({ rotation: [0, 0, -(clamp(t, 0, T) / dial) * Math.PI * 2] }) });
  parts.push({ name: 'Stopwatch_Hand', parent: 'Stopwatch_HandAt', shape: { kind: 'box', size: [0.012, 0.22, 0.006] }, position: [0, 0.09, 0], color: '#212529', material: 'plastic' });
  if (labels) parts.push(text('Stopwatch_Label', `t = 2s/v = ${q(T, 's', lang)}`, [0, -0.45, 0], 0.14, { parent: 'Stopwatch' }));
  if (on(modes, 'vectors')) {
    parts.push({ name: 'Arrow_Velocity', shape: { kind: 'group' }, noPick: true });
    parts.push({
      name: 'Arrow_Velocity_Out', parent: 'Arrow_Velocity', shape: { kind: 'arrow', from: [0, 0, 0], vector: [0.8, 0, 0], radius: 0.03 }, color: '#ff8c42', ...arrowLook,
      motion: (t) => ({ position: [outX(t) - 0.9, EY + 0.75, 0], visible: t > 0 && t < T / 2 }),
    });
    parts.push({
      name: 'Arrow_Velocity_Back', parent: 'Arrow_Velocity', shape: { kind: 'arrow', from: [0, 0, 0], vector: [-0.8, 0, 0], radius: 0.03 }, color: '#4cc9f0', ...arrowLook,
      motion: (t) => ({ position: [backX(t) + 0.9, EY + 0.75, 0], visible: t >= T / 2 && t <= T }),
    });
    if (labels) parts.push(text('Arrow_Velocity_Label', `v = ${q(p.speed, 'm/s', lang)}`, [0, EY + 1.05, 0], 0.15, { color: COLORS.velocity }));
  }
  if (on(modes, 'trace')) {
    for (let i = 1; i <= 8; i++) {
      const x = ES + (EW * i) / 8;
      parts.push({ name: `Trace_${i}`, shape: { kind: 'sphere', radius: 0.035, widthSegments: 12 }, position: [x, EY + 0.12, 0.05], color: '#ff8c42', material: 'emissive', glow: 1, noPick: true, motion: (t) => ({ visible: t > 0 && outX(t) >= x - 1e-6 }) });
      const xb = EC - (EW * i) / 8;
      parts.push({ name: `Trace_${8 + i}`, shape: { kind: 'sphere', radius: 0.035, widthSegments: 12 }, position: [xb, EY - 0.12, 0.05], color: '#4cc9f0', material: 'emissive', glow: 1, noPick: true, motion: (t) => ({ visible: t >= T / 2 && backX(t) <= xb + 1e-6 }) });
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Echo model clock: the round trip plays in ECHO_PLAY s of the free clock, then pauses. */
export function echoClock(p: WavesParams, free: number): number {
  const T = echoTime(p.distance, p.speed);
  const k = Math.max(0, free) % (ECHO_PLAY + ECHO_PAUSE);
  return (Math.min(k, ECHO_PLAY) / ECHO_PLAY) * T;
}

export const waves: SimModel = {
  id: 'waves',
  modes: [MODE.vectors(), MODE.trace(), LABELS],
  clock(raw, pb, free) {
    const p = parseWavesParams(raw);
    if (p.variant === 'echo') return pb ? clamp(pb.fraction, 0, 1) * echoTime(p.distance, p.speed) : echoClock(p, free);
    return pb ? pb.time : free;
  },
  build(raw, { modes, lang = 'ru' }) {
    const p = parseWavesParams(raw);
    const labels = on(modes, 'labels');
    let parts: Part[];
    let readAt: Vec3;
    // Readouts sit beside the scene (left, right-aligned) where the wide stage has room; the echo's above the field.
    let align: 'left' | 'right' = 'right';
    let note: string | null = null;
    if (p.variant === 'echo') {
      parts = buildEcho(p, modes, lang);
      readAt = [-3.2, 3.4, -0.6];
      align = 'left';
    } else {
      const v = waveView(p);
      note = slowNote(p, v, lang);
      if (p.variant === 'sound') {
        parts = buildSound(p, v, modes, lang);
        readAt = [FX - 0.75, FY + 0.9, 0];
      } else {
        parts = buildChain(p, v, modes, lang);
        readAt = [X0 - 0.95, Y0 + 0.5, 0];
      }
    }
    if (labels) {
      const lines = wavesReadout(p, lang);
      if (note) lines.push(note);
      parts.push(text('Readout', lines.join('\n'), readAt, 0.14, { align }));
    }
    return parts;
  },
};
