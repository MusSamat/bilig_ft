/** Apply subject-hue tokens to CSS variables (TZ W-03) — one hue, both themes, AA by construction. */
import { tokensFromHue, type Theme } from '@bilig/scene-core';

const VARS: Record<string, keyof ReturnType<typeof tokensFromHue>> = {
  '--bg-from': 'bgFrom',
  '--bg-to': 'bgTo',
  '--accent': 'accent',
  '--accent-text': 'accentText',
  '--surface': 'surface',
  '--text': 'text',
  '--text-muted': 'textMuted',
  '--button': 'button',
  '--button-text': 'buttonText',
  '--focus': 'focus',
  '--border': 'border',
};

export function applyTheme(hue: number, theme: Theme, root: HTMLElement = document.documentElement): void {
  const t = tokensFromHue(hue, theme);
  for (const [cssVar, key] of Object.entries(VARS)) root.style.setProperty(cssVar, t[key]);
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.surface);
}
