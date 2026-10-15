import { describe, it, expect } from 'vitest';
import { player, SPEEDS, type PlayerState } from './index.js';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const proc = animalCellPackage.processes[0]; // durations 2, 3, (1)
const fresh = (): PlayerState => player.createPlayer(proc.steps);

describe('process player (W-41/W-42)', () => {
  it('creates from step durations (default 1s)', () => {
    const s = fresh();
    expect(s).toEqual({ durations: [2, 3, 1], time: 0, playing: false, speed: 1 });
    expect(player.totalDuration(s)).toBe(6);
    expect(player.stepStarts(s)).toEqual([0, 2, 5]);
    expect(player.createPlayer([{ duration: -1 }]).durations).toEqual([1]);
  });

  it('play / pause / toggle / reset', () => {
    let s = player.play(fresh());
    expect(s.playing).toBe(true);
    s = player.toggle(s);
    expect(s.playing).toBe(false);
    s = player.toggle(s);
    expect(s.playing).toBe(true);
    s = player.tick(s, 1);
    s = player.reset(s);
    expect(s).toMatchObject({ time: 0, playing: false });
    expect(player.play(player.createPlayer([]))).toEqual(player.createPlayer([]));
  });

  it('tick advances by dt × speed and stops at the end', () => {
    let s = player.play(fresh());
    s = player.tick(s, 1);
    expect(s.time).toBe(1);
    expect(player.tick(player.pause(s), 1).time).toBe(1); // paused: no-op
    expect(player.tick(s, -1)).toBe(s);
    s = player.setSpeed(s, 2);
    s = player.tick(s, 1);
    expect(s.time).toBe(3);
    expect(player.currentStep(s)).toBe(1);
    s = player.tick(s, 100);
    expect(s).toMatchObject({ time: 6, playing: false });
    expect(player.isEnded(s)).toBe(true);
    expect(player.currentStep(s)).toBe(2);
    expect(player.percent(s)).toBe(100);
    expect(player.play(s).time).toBe(0); // play after end restarts
  });

  it('speed accepts only 0.5 / 1 / 2', () => {
    expect(SPEEDS).toEqual([0.5, 1, 2]);
    expect(player.setSpeed(fresh(), 0.5).speed).toBe(0.5);
    expect(player.setSpeed(fresh(), 3).speed).toBe(1);
  });

  it('seek (slider) clamps; seekStep jumps to a step start', () => {
    expect(player.seek(fresh(), 0.5).time).toBe(3);
    expect(player.seek(fresh(), 7).time).toBe(6);
    expect(player.seek(fresh(), NaN).time).toBe(0);
    const s = player.seekStep(fresh(), 2);
    expect(s.time).toBe(5);
    expect(player.currentStep(s)).toBe(2);
    expect(player.seekStep(fresh(), 99).time).toBe(5);
    expect(player.seekStep(player.createPlayer([]), 1).time).toBe(0);
  });

  it('percent, step fraction and segmented bar', () => {
    const s = player.seek(fresh(), 0.5); // t=3: step 1, 1/3 through
    expect(player.percent(s)).toBe(50);
    expect(player.stepFraction(s)).toBeCloseTo(1 / 3);
    expect(player.segments(s)).toEqual([
      { index: 0, start: 0, end: 2, fill: 1 },
      { index: 1, start: 2, end: 5, fill: 1 / 3 },
      { index: 2, start: 5, end: 6, fill: 0 },
    ]);
    const empty = player.createPlayer([]);
    expect(player.percent(empty)).toBe(0);
    expect(player.currentStep(empty)).toBe(-1);
    expect(player.stepFraction(empty)).toBe(0);
  });

  it('reducer covers every action and playerView summarizes', () => {
    let s = fresh();
    for (const a of [
      { type: 'play' }, { type: 'tick', dt: 1 }, { type: 'speed', speed: 2 }, { type: 'pause' },
      { type: 'toggle' }, { type: 'seek', fraction: 0 }, { type: 'seekStep', index: 1 },
    ] as const) s = player.playerReducer(s, a);
    expect(player.playerView(s)).toEqual({ stepIndex: 1, percent: 33, playing: true, speed: 2 });
    expect(player.playerReducer(s, { type: 'reset' }).time).toBe(0);
  });
});
