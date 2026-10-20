import { describe, it, expect } from 'vitest';
import {
  tokensFromHue,
  contrastRatio,
  meetsAA,
  parseHsl,
  luminance,
  AA_NORMAL,
  AA_LARGE,
  subjectSwatch,
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

describe('Workbench prototype formula (backgrounds and glass are verbatim)', () => {
  it('light, hue 168', () => {
    const tk = tokensFromHue(168, 'light');
    expect([tk.g1, tk.g2, tk.g3, tk.g4]).toEqual(['hsl(168 58% 82%)', 'hsl(203 55% 86%)', 'hsl(168 42% 96%)', 'hsl(160 36% 90%)']);
    expect([tk.panel, tk.edge, tk.chip]).toEqual(['rgb(255 255 255 / 0.58)', 'rgb(255 255 255 / 0.85)', 'rgb(255 255 255 / 0.55)']);
    expect([tk.line, tk.soft, tk.on]).toEqual(['hsl(168 40% 15% / 0.12)', 'hsl(168 70% 35% / 0.09)', 'hsl(0 0% 100%)']);
    expect(tk.ink).toBe('hsl(168 45% 13%)');
    expect(tk.muted).toBe('hsl(168 18% 33%)');
  });
  it('dark, hue 236', () => {
    const tk = tokensFromHue(236, 'dark');
    expect([tk.g1, tk.g2, tk.g3, tk.g4]).toEqual(['hsl(236 48% 24%)', 'hsl(271 48% 19%)', 'hsl(236 40% 7%)', 'hsl(228 35% 11%)']);
    expect([tk.panel, tk.edge, tk.line, tk.chip]).toEqual(['hsl(236 35% 13% / 0.56)', 'rgb(255 255 255 / 0.12)', 'rgb(255 255 255 / 0.12)', 'rgb(255 255 255 / 0.05)']);
    expect([tk.ink, tk.muted, tk.accent, tk.on]).toEqual(['hsl(236 30% 93%)', 'hsl(236 16% 70%)', 'hsl(236 70% 70%)', 'hsl(236 60% 9%)']);
    expect(tk.sh).toBe('0 16px 40px rgb(0 0 0 / 0.35)');
  });
  it('hue wraps for g2 / g4 (h+35, h-8)', () => {
    expect(tokensFromHue(350, 'light').g2).toBe('hsl(25 55% 86%)');
    expect(tokensFromHue(3, 'dark').g4).toBe('hsl(355 35% 11%)');
  });
});

describe('subjectSwatch — subject chips are readable at small sizes (AA 4.5:1)', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: chip text passes AA on the chip for all hues`, () => {
      const failures: number[] = [];
      for (let hue = 0; hue <= 359; hue++) {
        const sw = subjectSwatch(hue, theme);
        if (contrastRatio(parseHsl(sw.fg), parseHsl(sw.bg)) < AA_NORMAL) failures.push(hue);
      }
      expect(failures).toEqual([]);
    });
  }
});
