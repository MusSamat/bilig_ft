/**
 * Admin theming: the client's Workbench tokens (`--g1…--sh`, from
 * `@bilig/scene-core` via `src/lib/theme`) applied to `.admin-root` for a
 * neutral brand hue, or for the subject being edited on subject-scoped pages.
 * The light/dark choice is the same preference as the client (`bilig.theme`).
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { create } from 'zustand';
import { themeVars } from '../../lib/theme';
import { useUi } from '../../state/ui';
import { ADMIN_HUE } from '../lib/hue';

interface HueState {
  /** Hue of the subject in scope (null: brand hue). */
  hue: number | null;
  setHue(hue: number | null): void;
}

export const useAdminHue = create<HueState>((set) => ({ hue: null, setHue: (hue) => set({ hue }) }));

/** Scope the admin theme to a subject hue while the calling page is mounted. */
export function useScopedHue(hue: number | undefined | null) {
  const setHue = useAdminHue((s) => s.setHue);
  useEffect(() => {
    setHue(typeof hue === 'number' && Number.isFinite(hue) ? hue : null);
  }, [hue, setHue]);
  useEffect(() => () => setHue(null), [setHue]);
}

export function useAdminTheme(): { theme: 'light' | 'dark'; toggle(): void; style: CSSProperties } {
  const theme = useUi((s) => s.theme);
  const toggle = useUi((s) => s.toggleTheme);
  const hue = useAdminHue((s) => s.hue) ?? ADMIN_HUE;
  const style = useMemo(() => themeVars(hue, theme) as CSSProperties, [hue, theme]);
  useEffect(() => {
    const d = document.documentElement;
    d.dataset.theme = theme;
    d.style.colorScheme = theme;
  }, [theme]);
  return { theme, toggle, style };
}
