/**
 * Formula readouts for simulation processes (TZ W-43). Dispatches on the
 * process params signature, independent of the engine label, and returns
 * exactly the process metric keys it can compute; [] otherwise (the core then
 * falls back to the process engine).
 */
import type { Process } from '@bilig/content-model';
import type { PlayerView, Readout } from '@bilig/scene-core';
import {
  circuitState, inclineState, moonState, orbitState, parseCircuitParams, parseInclineParams,
  parseOrbitParams, parsePendulumParams, pendulumState, seasonState,
} from './physics.js';

type View = Pick<PlayerView, 'time' | 'fraction' | 'stepIndex' | 'stepFraction'>;

const DEFAULT_UNITS: Record<string, string> = {
  angle: '°', speed: 'm/s', v: 'm/s', height: 'm', ke: 'J', pe: 'J', energy: 'J', period: 's',
  distance: 'm', acceleration: 'm/s²', time: 's', current: 'A', voltage: 'V', power: 'W',
};

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Which physical model a process's params describe (null = not a simulation process). */
export function processModel(params: Record<string, number> | undefined):
  | 'pendulum' | 'inclined-plane' | 'orbit' | 'dc-circuit' | 'moon-phases' | 'seasons' | null {
  const p = params ?? {};
  const has = (k: string) => typeof p[k] === 'number';
  if (has('angleDeg') && has('mu')) return 'inclined-plane';
  if (has('length') && (has('amplitudeDeg') || has('theta0'))) return 'pendulum';
  if (has('gmSunKm3PerS2')) return 'orbit';
  if (has('emf') && (has('resistance') || has('lampResistance'))) return 'dc-circuit';
  if (has('synodicMonthDays')) return 'moon-phases';
  if (has('axialTiltDeg') && (has('latitudeDeg') || has('observerLatitudeDeg'))) return 'seasons';
  return null;
}

/** All values a model computes at the given playback, keyed by metric key. */
export function modelValues(process: Process, view: View): Record<string, number> | null {
  const p = process.params ?? {};
  switch (processModel(p)) {
    case 'pendulum': {
      const s = pendulumState(parsePendulumParams(p), view.time);
      return { angle: (s.theta * 180) / Math.PI, speed: s.speed, v: s.speed, height: s.height, ke: s.ke, pe: s.pe, energy: s.energy, period: s.period };
    }
    case 'inclined-plane': {
      const s = inclineState(parseInclineParams(p), view.time);
      return { speed: s.speed, v: s.speed, distance: s.distance, acceleration: s.acceleration, time: s.time, ke: s.ke, pe: s.pe, energy: s.energy };
    }
    case 'orbit': {
      const s = orbitState(parseOrbitParams(p), view.fraction);
      return { distance: s.distanceAu, speed: s.speedKmS, elapsed: s.elapsedDays, period: s.periodDays };
    }
    case 'dc-circuit': {
      // Open during the first step; closed (I = U/R) from the second step on.
      const s = circuitState(parseCircuitParams(p), view.stepIndex >= 1 ? 1 : 0);
      return { current: s.current, voltage: s.voltage, power: s.power };
    }
    case 'moon-phases': {
      const s = moonState(p.synodicMonthDays, view.fraction * p.synodicMonthDays);
      return { illuminated: s.illuminated, age: s.age, elongation: s.elongation };
    }
    case 'seasons': {
      const s = seasonState(p.latitudeDeg ?? p.observerLatitudeDeg, p.axialTiltDeg, p.eccentricity ?? 0.0167, view.fraction);
      return { 'day-length': s.dayLength, 'noon-altitude': s.noonAltitude, 'sun-distance': s.sunDistance, declination: s.declinationDeg };
    }
    default:
      return null;
  }
}

export function simReadouts(process: Process, view: View): Readout[] {
  const values = modelValues(process, view);
  if (!values) return [];
  return process.metrics
    .filter((m) => m.key in values)
    .map((m) => ({
      key: m.key,
      label: m.label,
      value: round(values[m.key], m.precision ?? 2),
      unit: m.unit ?? DEFAULT_UNITS[m.key],
      min: m.min,
      max: m.max,
    }));
}

/** Backwards-compatible name. */
export const pendulumReadouts = simReadouts;
