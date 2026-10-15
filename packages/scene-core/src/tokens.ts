/**
 * Color tokens derived from a single subject hue (TZ W-03).
 *
 * "Все токены вычисляются из одного `hue` предмета; контраст AA проверяется
 * тестом для hue 0–359." So this module is pure math on HSL and must produce
 * WCAG-AA-passing text/background pairs for every hue in both themes.
 */
import type { Subject } from '@bilig/content-model';

export type Theme = 'light' | 'dark';

export interface ThemeTokens {
  /** Page background gradient stops (CSS hsl strings). */
  bgFrom: string;
  bgTo: string;
  /** Accent used for interactive elements. */
  accent: string;
  /** Panel/surface background. */
  surface: string;
  /** Primary text color that meets AA on `surface`. */
  text: string;
  /** Muted/secondary text that meets AA on `surface`. */
  textMuted: string;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

const clampHue = (h: number): number => ((Math.round(h) % 360) + 360) % 360;
const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

export const hsl = ({ h, s, l }: HSL): string =>
  `hsl(${clampHue(h)} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)`;

/** Relative luminance (WCAG) of an HSL color. */
export function luminance({ h, s, l }: HSL): number {
  const sN = clamp(s, 0, 100) / 100;
  const lN = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = clampHue(h) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const lin = (v: number): number => {
    const vv = v + m;
    return vv <= 0.03928 ? vv / 12.92 : ((vv + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two HSL colors (1..21). */
export function contrastRatio(a: HSL, b: HSL): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.1 AA for normal text is 4.5:1 (TZ §10 Доступность). */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

export function meetsAA(a: HSL, b: HSL, large = false): boolean {
  return contrastRatio(a, b) >= (large ? AA_LARGE : AA_NORMAL);
}

/**
 * Pick the lightness for text that guarantees AA against a surface. We walk
 * lightness toward black or white (whichever the surface favors) until AA holds.
 * Guarantees a passing color for every hue because pure black/white always pass
 * against a mid surface, and the surfaces here are near the extremes.
 */
function readableText(surface: HSL, hue: number, minRatio: number): HSL {
  const goDark = luminance(surface) > 0.5;
  for (let l = goDark ? 40 : 95; goDark ? l >= 0 : l <= 100; l += goDark ? -4 : 4) {
    const candidate: HSL = { h: hue, s: goDark ? 30 : 18, l };
    if (contrastRatio(candidate, surface) >= minRatio) return candidate;
  }
  // Fallback to pure extreme — always passes against these surfaces.
  return goDark ? { h: hue, s: 0, l: 0 } : { h: hue, s: 0, l: 100 };
}

/** Compute the full token set for a hue + theme (TZ W-03). */
export function tokensFromHue(hue: number, theme: Theme): ThemeTokens {
  const h = clampHue(hue);
  if (theme === 'dark') {
    const surface: HSL = { h, s: 24, l: 12 };
    return {
      bgFrom: hsl({ h, s: 30, l: 8 }),
      bgTo: hsl({ h: h + 20, s: 28, l: 14 }),
      accent: hsl({ h, s: 70, l: 62 }),
      surface: hsl(surface),
      text: hsl(readableText(surface, h, AA_NORMAL)),
      textMuted: hsl(readableText(surface, h, AA_LARGE)),
    };
  }
  const surface: HSL = { h, s: 30, l: 97 };
  return {
    bgFrom: hsl({ h, s: 40, l: 96 }),
    bgTo: hsl({ h: h + 20, s: 45, l: 90 }),
    accent: hsl({ h, s: 65, l: 40 }),
    surface: hsl(surface),
    text: hsl(readableText(surface, h, AA_NORMAL)),
    textMuted: hsl(readableText(surface, h, AA_LARGE)),
  };
}

/** Convenience: tokens for a subject. */
export const subjectTokens = (subject: Subject, theme: Theme): ThemeTokens =>
  tokensFromHue(subject.hue, theme);

/** Parse an `hsl(h s% l%)` string back to HSL for testing/verification. */
export function parseHsl(str: string): HSL {
  const m = str.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (!m) throw new Error(`not an hsl() string: ${str}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}
