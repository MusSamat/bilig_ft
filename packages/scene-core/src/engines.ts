/**
 * Process engines (TZ W-41/W-43, A-08): `timeline`, `stoich`, `ode`. Every
 * metric value shown in the readouts panel is COMPUTED here (or by a plugin's
 * own `readouts()`), from the process data and the current playback — never a
 * hand-written number in UI code.
 *
 * Parameter conventions (all in `Process.params`, a flat `Record<string, number>`):
 *  - timeline: `<metric>@<stepKey>` = cumulative metric value at the END of that
 *    step; within a step the value eases from the previous step's value. Steps
 *    without an entry carry the previous value. A metric with no entries at
 *    all is distributed over the step durations from `min` to `max`.
 *  - stoich: `n0.<metric>` initial amount, `nu.<metric>` signed stoichiometric
 *    coefficient, optional `extent` (max reaction extent ξ, default 1):
 *    n(ξ) = n0 + ν·ξ, with ξ = fraction·extent.
 *    Content form (bilig_back/content): species coefficients `H2O: 2` with
 *    molar masses `M_H2O`, and `dH_kJ`; reactants/products are read from the
 *    equation's sides. A metric whose key is a species (case-insensitive)
 *    shows its mass (when `M_<S>` exists) or amount; reactants go
 *    coef·M → 0, products 0 → coef·M; `heat`/`energy` = |ΔH|·ξ.
 *  - ode: damped harmonic oscillator x'' = −ω²x − 2ζωx'. Params `omega`
 *    (rad/s, default 2π), `zeta` (default 0), `x0` (default 1), `v0` (0),
 *    `mass` (1). Metrics `x`, `v`, `ke`, `pe`, `energy` are recognised.
 */
import type { Process, ProcessMetric } from '@bilig/content-model';
import type { PlayerView } from './player.js';
import type { Readout } from './index.js';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, digits = 6) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Smoothstep easing so a step's value changes smoothly, not as a straight ramp. */
const ease = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const readout = (m: ProcessMetric, value: number): Readout => ({
  key: m.key,
  label: m.label,
  value: round(value, m.precision ?? 3),
  unit: m.unit,
  min: m.min,
  max: m.max,
});

const stepDurations = (p: Process) => p.steps.map((s) => (s.duration && s.duration > 0 ? s.duration : 1));

/** timeline engine — cumulative per-step targets. */
export function timelineReadouts(p: Process, view: Pick<PlayerView, 'stepIndex' | 'stepFraction' | 'fraction'>): Readout[] {
  const params = p.params ?? {};
  const durations = stepDurations(p);
  const total = durations.reduce((a, b) => a + b, 0) || 1;
  const i = clamp(view.stepIndex, 0, p.steps.length - 1);
  return p.metrics.map((m) => {
    const lo = m.min ?? 0;
    const targets = p.steps.map((s) => params[`${m.key}@${s.key}`]);
    let value: number;
    if (targets.every((t) => t === undefined)) {
      // No per-step data: distribute min→max over the elapsed share of step durations.
      const hi = m.max ?? lo;
      const elapsed = durations.slice(0, i).reduce((a, b) => a + b, 0) + durations[i] * ease(view.stepFraction);
      value = lo + (hi - lo) * (elapsed / total);
    } else {
      let prev = lo;
      for (let k = 0; k < i; k++) prev = targets[k] ?? prev;
      const target = targets[i] ?? prev;
      value = prev + (target - prev) * ease(view.stepFraction);
    }
    return readout(m, value);
  });
}

/** Species on each side of a TeX equation (`2H_2O \\to 2H_2 + O_2` → {left:[H2O], right:[H2, O2]}). */
export function equationSides(equation: string | undefined): { left: string[]; right: string[] } {
  if (!equation) return { left: [], right: [] };
  const plain = equation.replace(/\\(to|rightarrow|longrightarrow|rightleftharpoons)/g, '→').replace(/[_{}\s]/g, '').replace(/\\[a-zA-Z]+/g, '');
  const [l = '', r = ''] = plain.split(/→|=|->/);
  const species = (side: string) => side.split('+').map((x) => x.replace(/^\d+(\.\d+)?/, '')).filter(Boolean);
  return { left: species(l), right: species(r) };
}

/** stoich engine — amounts follow the reaction extent. */
export function stoichReadouts(p: Process, view: Pick<PlayerView, 'fraction'>): Readout[] {
  const params = p.params ?? {};
  const xi = clamp(view.fraction, 0, 1) * (params.extent ?? 1);
  const sides = equationSides(p.equation);
  const speciesKey = (metric: string) => Object.keys(params).find((k) => k.toLowerCase() === metric.toLowerCase() && !k.includes('.'));
  return p.metrics.map((m) => {
    if (params[`n0.${m.key}`] !== undefined || params[`nu.${m.key}`] !== undefined) {
      return readout(m, Math.max(0, (params[`n0.${m.key}`] ?? 0) + (params[`nu.${m.key}`] ?? 0) * xi));
    }
    const sp = speciesKey(m.key);
    if (sp) {
      const amount = params[sp] * (params[`M_${sp}`] ?? 1);
      const reactant = sides.left.includes(sp) && !sides.right.includes(sp);
      return readout(m, reactant ? amount * (1 - xi) : amount * xi);
    }
    if ((m.key === 'heat' || m.key === 'energy') && params.dH_kJ !== undefined) return readout(m, Math.abs(params.dH_kJ) * xi);
    return readout(m, (m.min ?? 0) + ((m.max ?? m.min ?? 0) - (m.min ?? 0)) * xi);
  });
}

/** Closed-form damped oscillator state at time t. */
export function oscillator(t: number, omega: number, zeta: number, x0: number, v0: number): { x: number; v: number } {
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const a = x0;
    const b = (v0 + zeta * omega * x0) / wd;
    const e = Math.exp(-zeta * omega * t);
    const x = e * (a * Math.cos(wd * t) + b * Math.sin(wd * t));
    const v =
      -zeta * omega * x + e * (-a * wd * Math.sin(wd * t) + b * wd * Math.cos(wd * t));
    return { x, v };
  }
  // Critically/over-damped: critically damped formula is a good bounded approximation.
  const e = Math.exp(-omega * t);
  const x = e * (x0 + (v0 + omega * x0) * t);
  const v = e * (v0 - omega * (v0 + omega * x0) * t);
  return { x, v };
}

/** ode engine — damped harmonic oscillator readouts. */
export function odeReadouts(p: Process, view: Pick<PlayerView, 'time'>): Readout[] {
  const params = p.params ?? {};
  const omega = params.omega ?? 2 * Math.PI;
  const zeta = params.zeta ?? 0;
  const mass = params.mass ?? 1;
  const { x, v } = oscillator(view.time, omega, zeta, params.x0 ?? 1, params.v0 ?? 0);
  const k = mass * omega * omega;
  const ke = 0.5 * mass * v * v;
  const pe = 0.5 * k * x * x;
  const values: Record<string, number> = { x, v, speed: Math.abs(v), ke, pe, energy: ke + pe };
  return p.metrics.filter((m) => m.key in values).map((m) => readout(m, values[m.key]));
}

/** Default readouts for a process by its engine. */
export function engineReadouts(p: Process, view: PlayerView): Readout[] {
  switch (p.engine) {
    case 'timeline':
      return timelineReadouts(p, view);
    case 'stoich':
      return stoichReadouts(p, view);
    case 'ode':
      return odeReadouts(p, view);
  }
}

/** Share of the metric's [min, max] range (0..1) for a readout bar. */
export function readoutFraction(r: Readout): number {
  if (typeof r.value !== 'number') return 0;
  const lo = r.min ?? 0;
  const hi = r.max ?? Math.max(lo + 1, r.value);
  return hi === lo ? 0 : clamp((r.value - lo) / (hi - lo), 0, 1);
}
