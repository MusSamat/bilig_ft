import { describe, expect, it } from 'vitest';
import { forces, forcesMotion, forcesState, parseForcesParams } from './forces.js';

const state = (raw: Record<string, unknown>) => forcesState(parseForcesParams(raw));

describe('forces v0 (Physics 7: inertia, Newton II readout)', () => {
  it('without friction a launched block coasts at constant speed across the table', () => {
    const s = state({ mass: 1, v0: 1.5, friction: 0 });
    expect(s.acceleration[0]).toBeCloseTo(0);
    const m = forcesMotion(s);
    expect(m.arrival).toBeCloseTo(2.5 / 1.5, 5);
    expect(m.speed(1)).toBeCloseTo(1.5);
    expect(m.at(1)[0] - m.at(0)[0]).toBeCloseTo(1.5);
  });

  it('kinetic friction μmg opposes the motion; the block stops at t = v0/(μg) and stays', () => {
    const s = state({ mass: 2, v0: 1.5, friction: 0.2, g: 9.8 });
    expect(s.friction).toBeCloseTo(-0.2 * 2 * 9.8);
    expect(s.acceleration[0]).toBeCloseTo(-0.2 * 9.8);
    const m = forcesMotion(s);
    expect(m.arrival).toBeCloseTo(1.5 / (0.2 * 9.8), 5);
    const stopAt = m.at(m.arrival)[0];
    expect(m.at(m.arrival + 5)[0]).toBeCloseTo(stopAt);
    expect(m.speed(m.arrival + 1)).toBe(0);
    // Leftwards: friction points right.
    expect(state({ mass: 1, v0: -1, friction: 0.3 }).friction).toBeGreaterThan(0);
  });

  it('labels show a = R/m; a launched block also shows its speed, ending at 0', () => {
    const parts = forces.build({ model: 'forces', mass: 2, forces: [{ id: 'F', magnitude: 10, angleDeg: 0 }], friction: 0, g: 9.8 }, { modes: { labels: true, vectors: true }, lang: 'ru' });
    const readout = parts.find((p) => p.name === 'Readout');
    expect(JSON.stringify(readout)).toContain('a = R/m = 5 м/с²');
    const slid = forces.build({ model: 'forces', mass: 1, v0: 1.5, friction: 0.2, g: 9.8 }, { modes: { labels: true }, lang: 'ru' });
    const texts = slid.filter((p) => p.name.startsWith('Readout_V_')).map((p) => JSON.stringify(p));
    expect(texts[0]).toContain('v = 1,5 м/с');
    expect(texts.at(-1)).toContain('v = 0 м/с');
    // Old scenes (no v0) are unchanged: the block starts at rest.
    expect(state({ mass: 1 }).v0).toBe(0);
  });
});
