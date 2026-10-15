/**
 * Global UI state (zustand): language, theme, view mode, current selection and
 * active scene modes. Content and routing live elsewhere.
 */
import { create } from 'zustand';
import { DEFAULT_LANG, isLang, type Lang, type ViewMode } from '@bilig/content-model';
import type { ModeState, Theme } from '@bilig/scene-core';
import i18n from './i18n';

interface AppState {
  lang: Lang;
  theme: Theme;
  view: ViewMode;
  selectedConceptKey: string | null;
  /** Active scene modes (TZ W-23): `{ [group]: modeId, [toggle]: boolean }`. */
  modes: ModeState;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setView: (view: ViewMode) => void;
  selectConcept: (key: string | null) => void;
  setModes: (modes: ModeState) => void;
}

const rawLang = localStorage.getItem('bilig.lang');
const storedLang: Lang = isLang(rawLang) ? rawLang : DEFAULT_LANG;
const storedTheme = (localStorage.getItem('bilig.theme') as Theme | null) ?? 'dark';

export const useStore = create<AppState>((set) => ({
  lang: storedLang,
  theme: storedTheme,
  view: 'study',
  selectedConceptKey: null,
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
  selectConcept: (selectedConceptKey) => set({ selectedConceptKey }),
  setModes: (modes) => set({ modes }),
}));
