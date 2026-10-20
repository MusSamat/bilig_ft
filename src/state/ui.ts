/**
 * UI state (zustand): theme, catalog modal, toasts, hue of the current subject.
 * Server data lives in TanStack Query; the viewer has its own store.
 */
import { create } from 'zustand';
import type { Localized, Subject } from '@bilig/content-model';
import type { Theme } from '@bilig/scene-core';

export interface Toast {
  id: number;
  /** i18n key + params; never a literal string. */
  key: string;
  params?: Record<string, unknown>;
  kind?: 'info' | 'success' | 'error';
  action?: { key: string; onClick: () => void };
}

/** What the header shows in its subject button (set by the topic page). */
export interface ShellContext {
  subject: Subject;
  topicTitle?: Localized;
  /** Section the topic belongs to (unit), shown under the subject name. */
  unitTitle?: Localized;
  topicKey?: string;
}

interface UiState {
  context: ShellContext | null;
  setContext(c: ShellContext | null): void;
  theme: Theme;
  hue: number;
  catalogOpen: boolean;
  /** Subject to show when the catalog opens (its course tree), or null for the overview. */
  catalogSubject: string | null;
  toasts: Toast[];
  setTheme(theme: Theme): void;
  toggleTheme(): void;
  setHue(hue: number): void;
  openCatalog(subjectKey?: string): void;
  closeCatalog(): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

/** Neutral hue for screens without a subject (home, cabinets). */
export const NEUTRAL_HUE = 220;

function initialTheme(): Theme {
  try {
    const s = localStorage.getItem('bilig.theme');
    if (s === 'light' || s === 'dark') return s;
  } catch {
    /* ignore */
  }
  // The approved design is light-first; dark follows the OS preference.
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let nextId = 1;

export const useUi = create<UiState>((set, get) => ({
  context: null,
  setContext: (context) => set({ context, hue: context?.subject.hue ?? NEUTRAL_HUE }),
  theme: initialTheme(),
  hue: NEUTRAL_HUE,
  catalogOpen: false,
  catalogSubject: null,
  toasts: [],
  setTheme(theme) {
    try {
      localStorage.setItem('bilig.theme', theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
  setHue: (hue) => set({ hue }),
  openCatalog: (subjectKey) => set({ catalogOpen: true, catalogSubject: typeof subjectKey === 'string' ? subjectKey : null }),
  closeCatalog: () => set({ catalogOpen: false }),
  toast(t) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (t: Omit<Toast, 'id'>): void => useUi.getState().toast(t);
