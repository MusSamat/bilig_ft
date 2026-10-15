/**
 * Apply subject-hue tokens to CSS variables (TZ W-03). All interface colors come
 * from a single hue + theme via @bilig/scene-core's tokensFromHue (AA-verified).
 */
import { tokensFromHue, type Theme } from '@bilig/scene-core';

/** Neutral hue for screens with no active subject (home, catalog). */
export const NEUTRAL_HUE = 220;

export function applyTheme(hue: number, theme: Theme): void {
  const t = tokensFromHue(hue, theme);
  const root = document.documentElement.style;
  root.setProperty('--bg-from', t.bgFrom);
  root.setProperty('--bg-to', t.bgTo);
  root.setProperty('--accent', t.accent);
  root.setProperty('--surface', t.surface);
  root.setProperty('--text', t.text);
  root.setProperty('--text-muted', t.textMuted);
  document.documentElement.dataset.theme = theme;
}
