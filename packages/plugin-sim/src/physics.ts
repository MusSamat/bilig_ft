/**
 * Simulation physics (TZ W-25 animation, W-43 «энергия и скорость считаются
 * по формулам»). Pure functions; every readout value is computed here.
 */
import { z } from 'zod';

const num = (lo: number, hi: number) => z.number().finite().min(lo).max(hi).optional().catch(undefined);
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
const pick = <T extends z.ZodRawShape>(shape: T, raw: unknown) => {
  const r = z.object(shape).safeParse(obj(raw));
  return (r.success ? r.data : {}) as { [K in keyof T]?: number };
};
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Pendulum: ω = √(g/L), θ(t) = θ₀·cos(ωt)·e^(−βt), T = 2π√(L/g)
// ---------------------------------------------------------------------------

export interface PendulumParams {
  /** String length, m. */
  length: number;
  /** Amplitude (release angle), degrees. */
  amplitudeDeg: number;
  mass: number;
  g: number;
  /** Amplitude decay rate β, 1/s. */
  damping: number;
}
export const DEFAULT_PENDULUM: PendulumParams = { length: 1, amplitudeDeg: 30, mass: 1, g: 9.81, damping: 0 };

/** Accepts `amplitudeDeg` (content) or the older `theta0`. */
export function parsePendulumParams(raw: unknown): PendulumParams {
  const p = pick({ length: num(0.01, 1000), amplitudeDeg: num(-179, 179), theta0: num(-179, 179), mass: num(1e-4, 1e6), g: num(0.01, 1000), damping: num(0, 100) }, raw);
  return {
    length: p.length ?? DEFAULT_PENDULUM.length,
    amplitudeDeg: p.amplitudeDeg ?? p.theta0 ?? DEFAULT_PENDULUM.amplitudeDeg,
    mass: p.mass ?? DEFAULT_PENDULUM.mass,
    g: p.g ?? DEFAULT_PENDULUM.g,
    damping: p.damping ?? DEFAULT_PENDULUM.damping,
  };
}

export interface PendulumState {
  /** Signed angle, rad (0 = bottom). */
  theta: number;
  amplitude: number;
  /** dθ/dt, rad/s. */
  angularVelocity: number;
  /** Height above the lowest point, m. */
  height: number;
  speed: number;
  ke: number;
  pe: number;
  energy: number;
  period: number;
}

/** h = L(1 − cos θ), v = √(2gL(cos θ − cos θₐ)), KE = ½mv², PE = mgh. */
export function pendulumState(p: PendulumParams, t: number): PendulumState {
  const omega = Math.sqrt(p.g / p.length);
  const th0 = p.amplitudeDeg * DEG;
  const decay = Math.exp(-p.damping * Math.max(0, t));
  const amplitude = Math.abs(th0) * decay;
  const theta = th0 * Math.cos(omega * t) * decay;
  const angularVelocity = -th0 * decay * (omega * Math.sin(omega * t) + p.damping * Math.cos(omega * t));
  const height = p.length * (1 - Math.cos(theta));
  const speed = Math.sqrt(Math.max(0, 2 * p.g * p.length * (Math.cos(theta) - Math.cos(amplitude))));
  const ke = 0.5 * p.mass * speed * speed;
  const pe = p.mass * p.g * height;
  return { theta, amplitude, angularVelocity, height, speed, ke, pe, energy: ke + pe, period: 2 * Math.PI * Math.sqrt(p.length / p.g) };
}

// ---------------------------------------------------------------------------
// Inclined plane: a = g(sin θ − μ cos θ) (0 when friction holds), s = ½at², v = at
// ---------------------------------------------------------------------------

export interface InclineParams {
  angleDeg: number;
  mass: number;
  /** Kinetic friction coefficient. */
  mu: number;
  g: number;
  /** Slope length, m. */
  length: number;
}
export const DEFAULT_INCLINE: InclineParams = { angleDeg: 30, mass: 2, mu: 0.2, g: 9.81, length: 3 };

export function parseInclineParams(raw: unknown): InclineParams {
  const p = pick({ angleDeg: num(0, 89.9), mass: num(1e-4, 1e6), mu: num(0, 10), g: num(0.01, 1000), length: num(0.01, 1000) }, raw);
  return {
    angleDeg: p.angleDeg ?? DEFAULT_INCLINE.angleDeg,
    mass: p.mass ?? DEFAULT_INCLINE.mass,
    mu: p.mu ?? DEFAULT_INCLINE.mu,
    g: p.g ?? DEFAULT_INCLINE.g,
    length: p.length ?? DEFAULT_INCLINE.length,
  };
}

export interface InclineState {
  /** Seconds since release, clamped to the arrival time. */
  time: number;
  acceleration: number;
  speed: number;
  /** Distance along the slope, ≤ length. */
  distance: number;
  /** Time to reach the bottom (∞ when friction holds the block). */
  arrival: number;
  /** Forces, N: gravity mg, normal mg cos θ, friction μ mg cos θ, net m·a. */
  forces: { gravity: number; normal: number; friction: number; net: number };
  ke: number;
  pe: number;
  energy: number;
}

export function inclineState(p: InclineParams, t: number): InclineState {
  const th = p.angleDeg * DEG;
  const a = Math.max(0, p.g * (Math.sin(th) - p.mu * Math.cos(th)));
  const arrival = a > 0 ? Math.sqrt((2 * p.length) / a) : Infinity;
  const time = Math.min(Math.max(0, t), arrival);
  const distance = Math.min(p.length, 0.5 * a * time * time);
  const speed = a * time;
  const normal = p.mass * p.g * Math.cos(th);
  const friction = a > 0 ? p.mu * normal : p.mass * p.g * Math.sin(th);
  const ke = 0.5 * p.mass * speed * speed;
  const pe = p.mass * p.g * (p.length - distance) * Math.sin(th);
  return { time, acceleration: a, speed, distance, arrival, forces: { gravity: p.mass * p.g, normal, friction, net: p.mass * a }, ke, pe, energy: ke + pe };
}

// ---------------------------------------------------------------------------
// DC circuit: I = U / R, P = U·I (ideal source and wires)
// ---------------------------------------------------------------------------

export interface CircuitParams {
  /** Source EMF, V. */
  emf: number;
  /** Load resistance, Ω. */
  resistance: number;
  switchClosed: boolean;
}
export const DEFAULT_CIRCUIT: CircuitParams = { emf: 4.5, resistance: 9, switchClosed: false };

/** Accepts `resistance` (process) or `lampResistance` (scene). */
export function parseCircuitParams(raw: unknown): CircuitParams {
  const p = pick({ emf: num(0, 1e6), resistance: num(1e-6, 1e9), lampResistance: num(1e-6, 1e9) }, raw);
  const closed = obj(raw).switchClosed;
  return {
    emf: p.emf ?? DEFAULT_CIRCUIT.emf,
    resistance: p.resistance ?? p.lampResistance ?? DEFAULT_CIRCUIT.resistance,
    switchClosed: typeof closed === 'boolean' ? closed : DEFAULT_CIRCUIT.switchClosed,
  };
}

/** `closed` 0..1 (switch closing ramps the readout). */
export function circuitState(p: CircuitParams, closed: number): { current: number; voltage: number; power: number } {
  const k = Math.min(1, Math.max(0, closed));
  const current = (p.emf / p.resistance) * k;
  const voltage = current * p.resistance;
  return { current, voltage, power: voltage * current };
}

// ---------------------------------------------------------------------------
// Kepler orbit: T = 2π√(a³/GM), M = E − e sin E, v = √(GM(2/r − 1/a))
// ---------------------------------------------------------------------------

export interface OrbitParams {
  gm: number;
  semiMajorAxisAu: number;
  eccentricity: number;
  auKm: number;
}
export const DEFAULT_ORBIT: OrbitParams = { gm: 132712440018, semiMajorAxisAu: 1, eccentricity: 0.0167, auKm: 149597870.7 };

export function parseOrbitParams(raw: unknown): OrbitParams {
  const p = pick({ gmSunKm3PerS2: num(1, 1e15), semiMajorAxisAu: num(1e-3, 1e4), eccentricity: num(0, 0.99), auKm: num(1, 1e12) }, raw);
  return {
    gm: p.gmSunKm3PerS2 ?? DEFAULT_ORBIT.gm,
    semiMajorAxisAu: p.semiMajorAxisAu ?? DEFAULT_ORBIT.semiMajorAxisAu,
    eccentricity: p.eccentricity ?? DEFAULT_ORBIT.eccentricity,
    auKm: p.auKm ?? DEFAULT_ORBIT.auKm,
  };
}

/** Solve Kepler's equation M = E − e sin E (Newton). */
export function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/** Orbit state at `fraction` (0..1) of one period, starting at perihelion. */
export function orbitState(p: OrbitParams, fraction: number) {
  const aKm = p.semiMajorAxisAu * p.auKm;
  const periodS = 2 * Math.PI * Math.sqrt(aKm ** 3 / p.gm);
  const M = 2 * Math.PI * fraction;
  const E = eccentricAnomaly(M, p.eccentricity);
  const e = p.eccentricity;
  const trueAnomaly = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const rKm = aKm * (1 - e * Math.cos(E));
  const speed = Math.sqrt(p.gm * (2 / rKm - 1 / aKm));
  return { trueAnomaly, distanceAu: rKm / p.auKm, speedKmS: speed, periodDays: periodS / 86400, elapsedDays: (fraction * periodS) / 86400 };
}

// ---------------------------------------------------------------------------
// Moon phases: elongation = 360°·age/synodic, illuminated = (1 − cos e)/2
// ---------------------------------------------------------------------------

export function moonState(synodicDays: number, ageDays: number) {
  const age = ((ageDays % synodicDays) + synodicDays) % synodicDays;
  const e = (2 * Math.PI * age) / synodicDays;
  const elongDeg = (e * 180) / Math.PI;
  return {
    age,
    /** Phase angle around the orbit, rad (0 = new moon). */
    phaseAngle: e,
    /** Angular distance from the Sun, 0..180°. */
    elongation: elongDeg <= 180 ? elongDeg : 360 - elongDeg,
    illuminated: ((1 - Math.cos(e)) / 2) * 100,
  };
}

// ---------------------------------------------------------------------------
// Seasons: δ = asin(sin ε · sin λ), noon altitude = 90° − φ + δ,
// day length = (24/π)·acos(−tan φ tan δ), r = a(1 − e cos(2π(d − d_peri)/year))
// ---------------------------------------------------------------------------

export const YEAR_DAYS = 365.25;
/** Day of year of the March equinox and of perihelion. */
export const MARCH_EQUINOX_DAY = 79;
export const PERIHELION_DAY = 3;

/** `fraction` 0..1 of the year starting at the March equinox. */
export function seasonState(latitudeDeg: number, tiltDeg: number, eccentricity: number, fraction: number) {
  const lambda = 2 * Math.PI * fraction;
  const decl = Math.asin(Math.sin(tiltDeg * DEG) * Math.sin(lambda));
  const phi = latitudeDeg * DEG;
  const x = Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(decl)));
  const day = MARCH_EQUINOX_DAY + fraction * YEAR_DAYS;
  const distance = 149.598 * (1 - eccentricity * Math.cos((2 * Math.PI * (day - PERIHELION_DAY)) / YEAR_DAYS));
  return {
    declinationDeg: decl / DEG,
    noonAltitude: 90 - latitudeDeg + decl / DEG,
    dayLength: (24 / Math.PI) * Math.acos(x),
    /** Sun distance, million km. */
    sunDistance: distance,
  };
}
