/**
 * Color tokens derived from a single subject hue (TZ W-03).
 *
 * "Все токены вычисляются из одного `hue` предмета; контраст AA проверяется
 * тестом для hue 0–359." The formula is the approved «Bilig Workbench»
 * prototype (its `applyTheme`): backgrounds, panels, lines and shadows are
 * taken verbatim; text and accent start at the prototype lightness and are
 * only walked (darker in light, lighter in dark) where a hue would otherwise
 * miss WCAG AA against the worst-case surface they sit on.
 */
import type { Subject } from '@bilig/content-model';

export type Theme = 'light' | 'dark';

export interface ThemeTokens {
  /* ---- prototype tokens (CSS custom properties of the same name) ---- */
  /** Radial background blobs (g1 top-right, g2 left) and the base gradient (g3 → g4). */
  g1: string;
  g2: string;
  g3: string;
  g4: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Accent: active controls, links, icons, focus ring. */
  accent: string;
  /** Text/icon colour on an accent fill. */
  on: string;
  /** Translucent glass panel fill. */
  panel: string;
  /** Glass panel edge (1px border). */
  edge: string;
  /** Hairlines, control borders, empty bars. */
  line: string;
  /** Accent-tinted soft fill (goal, fact, selected cards). */
  soft: string;
  /** Translucent chip / tile / control fill. */
  chip: string;
  /** Panel shadow. */
  sh: string;
  /** Status colours (quiz verdicts, badges), AA on the surface. */
  ok: string;
  bad: string;

  /* ---- derived / legacy names (kept for older consumers and the AA tests) ---- */
  /** Opaque worst-case surface text sits on (glass panel over g1). */
  surface: string;
  bgFrom: string;
  bgTo: string;
  text: string;
  textMuted: string;
  accentText: string;
  button: string;
  buttonText: string;
  focus: string;
  border: string;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clampHue = (h: number): number => ((Math.round(h) % 360) + 360) % 360;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

export const hsl = ({ h, s, l }: HSL): string => `hsl(${clampHue(h)} ${round(clamp(s, 0, 100))}% ${round(clamp(l, 0, 100))}%)`;
const hsla = (c: HSL, a: number): string => `hsl(${clampHue(c.h)} ${round(clamp(c.s, 0, 100))}% ${round(clamp(c.l, 0, 100))}% / ${a})`;

function hslToRgb({ h, s, l }: HSL): { r: number; g: number; b: number } {
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
  return { r: r + m, g: g + m, b: b + m };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h: clampHue(h), s: clamp(s * 100, 0, 100), l: l * 100 };
}

/** Relative luminance (WCAG) of an HSL color. */
export function luminance(c: HSL): number {
  const { r, g, b } = hslToRgb(c);
  const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
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

/** `fg` (with alpha) composited over the opaque `bg`. */
function over(fg: RGBA, bg: HSL): HSL {
  const b = hslToRgb(bg);
  const f = fg.a;
  return rgbToHsl({ r: fg.r * f + b.r * (1 - f), g: fg.g * f + b.g * (1 - f), b: fg.b * f + b.b * (1 - f) });
}
const rgbaOf = (c: HSL, a: number): RGBA => ({ ...hslToRgb(c), a });
const WHITE_A = (a: number): RGBA => ({ r: 1, g: 1, b: 1, a });

/**
 * Walk lightness from the prototype value in `step` increments until `ok`
 * holds (the extremes 0/100 always pass the predicates used here).
 */
function walk(c: HSL, step: number, ok: (c: HSL) => boolean): HSL {
  for (let l = c.l; l >= 0 && l <= 100; l += step) {
    const x = { ...c, l };
    if (ok(x)) return x;
  }
  return { ...c, l: step < 0 ? 0 : 100 };
}

/** Text targets: AA (4.5:1) on the worst-case surface — axe checks the real pixels. */
const TEXT_RATIO = AA_NORMAL + 0.05; // headroom for the 0.1% rounding of the CSS strings

/** The prototype formula with AA guards. */
function compute(h: number, theme: Theme): ThemeTokens {
  const dark = theme === 'dark';
  const g1: HSL = dark ? { h, s: 48, l: 24 } : { h, s: 58, l: 82 };
  const g2: HSL = dark ? { h: h + 35, s: 48, l: 19 } : { h: h + 35, s: 55, l: 86 };
  const g3: HSL = dark ? { h, s: 40, l: 7 } : { h, s: 42, l: 96 };
  const g4: HSL = dark ? { h: h - 8, s: 35, l: 11 } : { h: h - 8, s: 36, l: 90 };
  const panelRgba = dark ? rgbaOf({ h, s: 35, l: 13 }, 0.56) : WHITE_A(0.58);
  const softBase: HSL = dark ? { h, s: 70, l: 70 } : { h, s: 70, l: 35 };
  const softA = dark ? 0.14 : 0.09;
  // Worst case: glass over the most saturated background blob (g1).
  const surface = over(panelRgba, g1);

  const okText = (c: HSL) => contrastRatio(c, surface) >= TEXT_RATIO;
  const step = dark ? 1 : -1;
  const ink = walk(dark ? { h, s: 30, l: 93 } : { h, s: 45, l: 13 }, step, okText);
  const muted = walk(dark ? { h, s: 16, l: 70 } : { h, s: 18, l: 33 }, step, okText);
  const on: HSL = dark ? { h, s: 60, l: 9 } : { h: 0, s: 0, l: 100 };
  const accent = walk(dark ? { h, s: 70, l: 70 } : { h, s: 72, l: 29 }, step, (c) => okText(c) && contrastRatio(on, c) >= AA_NORMAL);
  const ok = walk(dark ? { h: 151, s: 57, l: 60 } : { h: 153, s: 63, l: 33 }, step, okText);
  const bad = walk(dark ? { h: 4, s: 100, l: 75 } : { h: 3, s: 54, l: 49 }, step, okText);
  const line = dark ? 'rgb(255 255 255 / 0.12)' : hsla({ h, s: 40, l: 15 }, 0.12);

  return {
    g1: hsl(g1),
    g2: hsl(g2),
    g3: hsl(g3),
    g4: hsl(g4),
    ink: hsl(ink),
    muted: hsl(muted),
    accent: hsl(accent),
    on: hsl(on),
    panel: dark ? hsla({ h, s: 35, l: 13 }, 0.56) : 'rgb(255 255 255 / 0.58)',
    edge: dark ? 'rgb(255 255 255 / 0.12)' : 'rgb(255 255 255 / 0.85)',
    line,
    soft: hsla(softBase, softA),
    chip: dark ? 'rgb(255 255 255 / 0.05)' : 'rgb(255 255 255 / 0.55)',
    sh: dark ? '0 16px 40px rgb(0 0 0 / 0.35)' : `0 16px 40px ${hsla({ h, s: 50, l: 30 }, 0.14)}`,
    ok: hsl(ok),
    bad: hsl(bad),
    surface: hsl(surface),
    bgFrom: hsl(g3),
    bgTo: hsl(g4),
    text: hsl(ink),
    textMuted: hsl(muted),
    accentText: hsl(accent),
    button: hsl(accent),
    buttonText: hsl(on),
    focus: hsl(accent),
    border: line,
  };
}

/** Compute the full token set for a hue + theme (TZ W-03). */
export function tokensFromHue(hue: number, theme: Theme): ThemeTokens {
  return compute(clampHue(hue), theme);
}

/** Convenience: tokens for a subject. */
export const subjectTokens = (subject: Subject, theme: Theme): ThemeTokens => tokensFromHue(subject.hue, theme);

/** Tokens exposed as CSS custom properties of the same name (`--g1`, `--ink`, …). */
export const TOKEN_CSS_VARS = ['g1', 'g2', 'g3', 'g4', 'ink', 'muted', 'accent', 'on', 'panel', 'edge', 'line', 'soft', 'chip', 'sh', 'ok', 'bad', 'surface'] as const satisfies readonly (keyof ThemeTokens)[];

/** Parse an `hsl(h s% l%)` string back to HSL for testing/verification. */
export function parseHsl(str: string): HSL {
  const m = str.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*[\d.]+\s*)?\)/);
  if (!m) throw new Error(`not an hsl() string: ${str}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** Prototype lightness of each AA-guarded token. */
const PROTO_L: Record<Theme, Record<'ink' | 'muted' | 'accent' | 'ok' | 'bad', number>> = {
  light: { ink: 13, muted: 33, accent: 29, ok: 33, bad: 49 },
  dark: { ink: 93, muted: 70, accent: 70, ok: 60, bad: 75 },
};

/** Hues (0–359) where a text/accent token had to deviate from the prototype lightness for AA. */
export function prototypeDeviations(theme: Theme): { token: string; hues: number[]; maxDelta: number }[] {
  return Object.entries(PROTO_L[theme]).flatMap(([k, l0]) => {
    const deltas = Array.from({ length: 360 }, (_, h) => Math.abs(parseHsl(tokensFromHue(h, theme)[k as 'ink']).l - l0));
    const hues = deltas.flatMap((d, h) => (d > 0.05 ? [h] : []));
    return hues.length ? [{ token: k, hues, maxDelta: Math.max(...deltas) }] : [];
  });
}

/** Catalog subject icon tile colours (Workbench `.sc .si`), from the subject hue. */
export function subjectSwatch(hue: number, theme: Theme): { bg: string; fg: string } {
  const h = clampHue(hue);
  return theme === 'dark' ? { bg: hsl({ h, s: 45, l: 22 }), fg: hsl({ h, s: 75, l: 75 }) } : { bg: hsl({ h, s: 60, l: 88 }), fg: hsl({ h, s: 70, l: 28 }) };
}

/** A structure's colour from its concept hue — the same in 3D, chips, dots, orbs and labels. */
export function conceptColor(hue: number, lightness = 60, saturation = 65): string {
  return `hsl(${clampHue(hue)}, ${saturation}%, ${lightness}%)`;
}
