/** Small shared hooks: language, media queries, online state, hotkeys, focus trap. */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANG, type Lang } from '@bilig/content-model';
import { isUiLang } from '../config';

/** Current UI language (follows the `/:lang` route via i18next). */
export function useLang(): Lang {
  const { i18n } = useTranslation();
  const l = i18n.language;
  return isUiLang(l) ? l : DEFAULT_LANG;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof matchMedia === 'undefined') return () => {};
      const mq = matchMedia(query);
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    () => (typeof matchMedia === 'undefined' ? false : matchMedia(query).matches),
    () => false,
  );
}

/** §10: respect prefers-reduced-motion (no auto-rotation, no decorative animation). */
export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
export const useCoarsePointer = (): boolean => useMediaQuery('(pointer: coarse)');

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    () => true,
  );
}

const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Global keydown handler; ignores keys typed into form fields unless `allowInInputs`. */
export function useKeydown(handler: (e: KeyboardEvent) => void, opts: { enabled?: boolean; allowInInputs?: boolean } = {}): void {
  const ref = useRef(handler);
  ref.current = handler;
  const { enabled = true, allowInInputs = false } = opts;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (!allowInInputs && isTyping(e.target)) return;
      ref.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled, allowInInputs]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab focus inside a dialog; restore focus to the opener on close (W-02).
 * `also`: selector of floating controls that stay reachable above the dialog (the assistant).
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, also?: string): void {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return;
      const extra = also ? [...document.querySelectorAll<HTMLElement>(also)].flatMap((el) => (el.matches(FOCUSABLE) ? [el] : [...el.querySelectorAll<HTMLElement>(FOCUSABLE)])) : [];
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE), ...extra].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', on);
    return () => {
      document.removeEventListener('keydown', on);
      opener?.focus?.();
    };
  }, [ref, active, also]);
}

/** Debounced value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
