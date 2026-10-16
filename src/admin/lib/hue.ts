/**
 * Subject hue → theme tokens + WCAG contrast (A-02 «hue с превью светлой и
 * тёмной темы и проверкой контраста»). The tokens are the client's own
 * (`@bilig/scene-core` tokensFromHue = the «Bilig Workbench» prototype
 * formula with AA guards), so the preview shows exactly what students get.
 */
import { tokensFromHue as sceneTokens, type Theme, type ThemeTokens } from '@bilig/scene-core';

export type { Theme, ThemeTokens };

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** Default admin hue: the brand indigo. */
export const ADMIN_HUE = 236;

const clampHue = (h: number) => ((Math.round(h) % 360) + 360) % 360;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const hsl = ({ h, s, l }: HSL) => `hsl(${clampHue(h)} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)`;

export function parseHsl(str: string): HSL {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*[\d.]+\s*)?\)/.exec(str);
  if (!m) throw new Error(`not an hsl() string: ${str}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** sRGB channels 0..1 of an HSL color. */
export function hslToRgb({ h, s, l }: HSL): [number, number, number] {
  const sN = clamp(s, 0, 100) / 100;
  const lN = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = clampHue(h) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lN - c / 2;
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => v + m) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
export function luminance(c: HSL): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hslToRgb(c).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: HSL, b: HSL): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The client's tokens for a hue (prototype formula, AA-guarded). */
export const tokensFromHue = (hue: number, theme: Theme): ThemeTokens => sceneTokens(hue, theme);

export interface ContrastCheck {
  pair: 'text' | 'textMuted' | 'accentText' | 'button' | 'focus';
  ratio: number;
  required: number;
  pass: boolean;
}

/** The AA checks shown next to the hue preview. */
export function contrastChecks(tokens: ThemeTokens): ContrastCheck[] {
  const s = parseHsl(tokens.surface);
  const rows: [ContrastCheck['pair'], HSL, HSL, number][] = [
    ['text', parseHsl(tokens.text), s, AA_NORMAL],
    ['textMuted', parseHsl(tokens.textMuted), s, AA_LARGE],
    ['accentText', parseHsl(tokens.accentText), s, AA_NORMAL],
    ['button', parseHsl(tokens.buttonText), parseHsl(tokens.button), AA_NORMAL],
    ['focus', parseHsl(tokens.focus), s, AA_LARGE],
  ];
  return rows.map(([pair, a, b, required]) => {
    const ratio = contrastRatio(a, b);
    return { pair, ratio, required, pass: ratio >= required };
  });
}
