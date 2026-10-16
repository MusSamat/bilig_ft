/**
 * Apply subject-hue tokens to CSS custom properties (TZ W-03): one hue, both
 * themes, AA by construction (scene-core tokensFromHue = the Workbench
 * prototype formula). The applied set is cached per theme so
 * /theme-boot.js can paint the right background before the app loads.
 */
import { TOKEN_CSS_VARS, tokensFromHue, type Theme } from '@bilig/scene-core';

export function themeVars(hue: number, theme: Theme): Record<string, string> {
  const t = tokensFromHue(hue, theme);
  return Object.fromEntries(TOKEN_CSS_VARS.map((k) => [`--${k}`, t[k]]));
}

export function applyTheme(hue: number, theme: Theme, root: HTMLElement = document.documentElement): void {
  const vars = themeVars(hue, theme);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(`bilig.tokens.${theme}`, JSON.stringify(vars));
  } catch {
    /* storage blocked */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokensFromHue(hue, theme).g3);
}
