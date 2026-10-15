/**
 * Global UI state (zustand). Deliberately small: language, theme, view mode,
 * current selection, and active scene modes. Content and routing live elsewhere.
 */
import { create } from 'zustand';
import type { Lang } from '@bilig/content-model';
import { DEFAULT_LANG } from '@bilig/content-model';
import type { Theme, ViewMode } from '@bilig/scene-core';
import i18n from './i18n';

interface AppState {
  lang: Lang;
  theme: Theme;
  view: ViewMode;
  selectedConceptId: string | null;
  /** Active scene modes keyed by id/group (TZ W-23). */
  modes: Record<string, boolean | string>;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setView: (view: ViewMode) => void;
  selectConcept: (id: string | null) => void;
  setMode: (id: string, value: boolean | string) => void;
}

const storedLang = (localStorage.getItem('bilig.lang') as Lang | null) ?? DEFAULT_LANG;
const storedTheme = (localStorage.getItem('bilig.theme') as Theme | null) ?? 'dark';

export const useStore = create<AppState>((set) => ({
  lang: storedLang,
  theme: storedTheme,
  view: 'study',
  selectedConceptId: null,
  modes: { rotate: true, labels: false },

  setLang: (lang) => {
    localStorage.setItem('bilig.lang', lang);
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
  setTheme: (theme) => {
    localStorage.setItem('bilig.theme', theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bilig.theme', theme);
      return { theme };
    }),
  setView: (view) => set({ view }),
  selectConcept: (selectedConceptId) => set({ selectedConceptId }),
  setMode: (id, value) =>
    set((s) => ({ modes: { ...s.modes, [id]: value } })),
}));
