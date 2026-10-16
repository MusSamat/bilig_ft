/**
 * Draft autosave (TZ §5 «автосохранение черновика»): unsaved form values are
 * kept per viewer in localStorage (debounced) together with the version they
 * were based on, offered back on reopen, and cleared after a successful save.
 */
import { useEffect, useRef } from 'react';

const PREFIX = 'bilig.admin.draft.';

export interface StoredDraft<T> {
  value: T;
  baseVersion: number | string | null;
  savedAt: string;
}

export function readDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as StoredDraft<T>) : null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T, baseVersion: number | string | null) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ value, baseVersion, savedAt: new Date().toISOString() }));
  } catch {
    /* storage full or blocked: autosave is a convenience */
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Autosave `value` under `key` while `dirty`, debounced. */
export function useAutosave<T>(key: string | null, value: T, baseVersion: number | string | null, dirty: boolean, delay = 800) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!key || !dirty) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => writeDraft(key, value, baseVersion), delay);
    return () => clearTimeout(timer.current);
  }, [key, value, baseVersion, dirty, delay]);
}
