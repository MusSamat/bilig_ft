/**
 * Process player (TZ W-41/W-42): «Запустить / Пауза», «Сначала», speed
 * 0.5× / 1× / 2×, seek slider, segmented step bar, percent. Pure reducer —
 * the UI drives it with `tick(dt)` from requestAnimationFrame.
 */

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export interface PlayerState {
  /** Duration (seconds at 1×) of each step. */
  durations: number[];
  /** Elapsed time in seconds (0..total). */
  time: number;
  playing: boolean;
  speed: Speed;
}

export interface Segment {
  index: number;
  start: number;
  end: number;
  /** 0..1 filled share of this segment. */
  fill: number;
}

export type PlayerAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'reset' }
  | { type: 'speed'; speed: Speed }
  | { type: 'seek'; fraction: number }
  | { type: 'seekStep'; index: number }
  | { type: 'tick'; dt: number };

const DEFAULT_STEP = 1;

/** Create a player for process steps (`duration` defaults to 1 s). */
export function createPlayer(steps: readonly { duration?: number }[]): PlayerState {
  return {
    durations: steps.map((s) => (s.duration && s.duration > 0 ? s.duration : DEFAULT_STEP)),
    time: 0,
    playing: false,
    speed: 1,
  };
}

export const totalDuration = (s: PlayerState): number => s.durations.reduce((a, b) => a + b, 0);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Start time of each step. */
export function stepStarts(s: PlayerState): number[] {
  const out: number[] = [];
  let t = 0;
  for (const d of s.durations) {
    out.push(t);
    t += d;
  }
  return out;
}

export const isEnded = (s: PlayerState): boolean => s.durations.length > 0 && s.time >= totalDuration(s);

export function play(s: PlayerState): PlayerState {
  if (s.durations.length === 0) return s;
  return { ...s, playing: true, time: isEnded(s) ? 0 : s.time };
}
export const pause = (s: PlayerState): PlayerState => ({ ...s, playing: false });
export const toggle = (s: PlayerState): PlayerState => (s.playing ? pause(s) : play(s));
export const reset = (s: PlayerState): PlayerState => ({ ...s, time: 0, playing: false });

export function setSpeed(s: PlayerState, speed: number): PlayerState {
  return (SPEEDS as readonly number[]).includes(speed) ? { ...s, speed: speed as Speed } : s;
}

/** Seek the slider to a fraction 0..1 of the whole process. */
export function seek(s: PlayerState, fraction: number): PlayerState {
  const f = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0;
  return { ...s, time: f * totalDuration(s) };
}

/** Jump to the start of a step (W-42: click on a step card). */
export function seekStep(s: PlayerState, index: number): PlayerState {
  if (s.durations.length === 0) return s;
  const i = clamp(Math.floor(index), 0, s.durations.length - 1);
  return { ...s, time: stepStarts(s)[i] };
}

/** Advance by `dt` real seconds × speed; stops at the end. */
export function tick(s: PlayerState, dt: number): PlayerState {
  if (!s.playing || !(dt > 0)) return s;
  const total = totalDuration(s);
  const time = s.time + dt * s.speed;
  return time >= total ? { ...s, time: total, playing: false } : { ...s, time };
}

/** Index of the current step (last step once ended; -1 when there are no steps). */
export function currentStep(s: PlayerState): number {
  if (s.durations.length === 0) return -1;
  const starts = stepStarts(s);
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (s.time >= starts[i]) idx = i;
  return idx;
}

/** Whole-process percent 0..100 (integer). */
export function percent(s: PlayerState): number {
  const total = totalDuration(s);
  return total === 0 ? 0 : Math.round((s.time / total) * 100);
}

/** 0..1 progress inside the current step. */
export function stepFraction(s: PlayerState): number {
  const i = currentStep(s);
  if (i < 0) return 0;
  const start = stepStarts(s)[i];
  return clamp((s.time - start) / s.durations[i], 0, 1);
}

/** Segmented step bar (W-41). */
export function segments(s: PlayerState): Segment[] {
  const starts = stepStarts(s);
  return s.durations.map((d, index) => ({
    index,
    start: starts[index],
    end: starts[index] + d,
    fill: clamp((s.time - starts[index]) / d, 0, 1),
  }));
}

export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case 'play':
      return play(s);
    case 'pause':
      return pause(s);
    case 'toggle':
      return toggle(s);
    case 'reset':
      return reset(s);
    case 'speed':
      return setSpeed(s, a.speed);
    case 'seek':
      return seek(s, a.fraction);
    case 'seekStep':
      return seekStep(s, a.index);
    case 'tick':
      return tick(s, a.dt);
  }
}

/** Compact view for ViewerState / URL (`step`). */
export interface PlayerView {
  stepIndex: number;
  percent: number;
  playing: boolean;
  speed: Speed;
}
export const playerView = (s: PlayerState): PlayerView => ({
  stepIndex: currentStep(s),
  percent: percent(s),
  playing: s.playing,
  speed: s.speed,
});
