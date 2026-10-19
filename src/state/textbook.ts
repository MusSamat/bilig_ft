/**
 * The teacher's textbook (contract 0.5.0): the last opened textbook and chapter,
 * kept on the device so Home can offer «Продолжить: …».
 */
import { create } from 'zustand';

const STORAGE_KEY = 'bilig.textbook';

export interface LastTextbook {
  key: string;
  chapterKey?: string;
}

interface TextbookState {
  last: LastTextbook | null;
  /** Remember a textbook; keeps the chapter when the same book is opened again without one. */
  remember(key: string, chapterKey?: string): void;
  forget(): void;
}

function load(): LastTextbook | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<LastTextbook>) : null;
    return v && typeof v.key === 'string' ? { key: v.key, ...(typeof v.chapterKey === 'string' ? { chapterKey: v.chapterKey } : {}) } : null;
  } catch {
    return null;
  }
}

function save(v: LastTextbook | null): void {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
}

export const useLastTextbook = create<TextbookState>((set, get) => ({
  last: load(),
  remember(key, chapterKey) {
    const prev = get().last;
    const next: LastTextbook = { key, ...(chapterKey ? { chapterKey } : prev?.key === key && prev.chapterKey ? { chapterKey: prev.chapterKey } : {}) };
    if (prev?.key === next.key && prev.chapterKey === next.chapterKey) return;
    save(next);
    set({ last: next });
  },
  forget() {
    save(null);
    set({ last: null });
  },
}));

/** DOM id of a chapter on the textbook page (the topic badge links to `#…`). */
export const chapterAnchor = (chapterKey: string): string => `tb-${chapterKey}`;
