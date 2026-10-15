import { describe, it, expect } from 'vitest';
import {
  tokensFromHue,
  contrastRatio,
  meetsAA,
  parseHsl,
  luminance,
  AA_NORMAL,
  AA_LARGE,
} from './tokens.js';

describe('tokensFromHue — AA contrast for every hue 0–359 (TZ W-03)', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: text meets AA on surface for all hues`, () => {
      const failures: number[] = [];
      for (let hue = 0; hue <= 359; hue++) {
        const tk = tokensFromHue(hue, theme);
        const ratio = contrastRatio(parseHsl(tk.text), parseHsl(tk.surface));
        if (ratio < AA_NORMAL) failures.push(hue);
      }
      expect(failures, `hues failing AA in ${theme}`).toEqual([]);
    });

    it(`${theme}: muted text meets at least AA-large on surface for all hues`, () => {
      const failures: number[] = [];
      for (let hue = 0; hue <= 359; hue++) {
        const tk = tokensFromHue(hue, theme);
        const ratio = contrastRatio(parseHsl(tk.textMuted), parseHsl(tk.surface));
        if (ratio < AA_LARGE) failures.push(hue);
      }
      expect(failures).toEqual([]);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: accent text, button label and focus ring pass AA for all hues`, () => {
      const failures: string[] = [];
      for (let hue = 0; hue <= 359; hue++) {
        const tk = tokensFromHue(hue, theme);
        const surface = parseHsl(tk.surface);
        if (contrastRatio(parseHsl(tk.accentText), surface) < AA_NORMAL) failures.push(`accentText@${hue}`);
        if (contrastRatio(parseHsl(tk.buttonText), parseHsl(tk.button)) < AA_NORMAL) failures.push(`button@${hue}`);
        if (contrastRatio(parseHsl(tk.focus), surface) < AA_LARGE) failures.push(`focus@${hue}`);
      }
      expect(failures).toEqual([]);
    });
  }

  it('is deterministic (same hue + theme → same tokens)', () => {
    expect(tokensFromHue(140, 'light')).toEqual(tokensFromHue(140, 'light'));
  });

  it('wraps hues modulo 360', () => {
    expect(tokensFromHue(360, 'light')).toEqual(tokensFromHue(0, 'light'));
  });
});

describe('contrast math', () => {
  it('black on white is 21:1', () => {
    const r = contrastRatio({ h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 100 });
    expect(r).toBeCloseTo(21, 0);
  });

  it('identical colors are 1:1 and fail AA', () => {
    const c = { h: 200, s: 50, l: 50 };
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
    expect(meetsAA(c, c)).toBe(false);
  });

  it('white is brighter than black', () => {
    expect(luminance({ h: 0, s: 0, l: 100 })).toBeGreaterThan(
      luminance({ h: 0, s: 0, l: 0 }),
    );
  });
});
