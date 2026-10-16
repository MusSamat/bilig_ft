/**
 * Admin i18n: its own `admin` namespace on the host's i18next instance
 * (TZ §5 «Интерфейс админки — на русском и кыргызском»). The admin language is
 * independent from the client UI language, so it never calls
 * `i18n.changeLanguage` on the host — it reads strings through a fixed `t`.
 */
import type { i18n as I18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import ky from './locales/ky.json';
import ru from './locales/ru.json';

export const ADMIN_NS = 'admin';
export const ADMIN_LANGS = ['ru', 'ky'] as const;
export type AdminLang = (typeof ADMIN_LANGS)[number];
export const ADMIN_RESOURCES: Record<AdminLang, Record<string, unknown>> = { ru, ky };

/** Register the `admin` namespace (idempotent). Call once from the host's i18n setup. */
export function registerAdminI18n(i18n: I18n): I18n {
  for (const lang of ADMIN_LANGS) {
    if (!i18n.hasResourceBundle(lang, ADMIN_NS)) i18n.addResourceBundle(lang, ADMIN_NS, ADMIN_RESOURCES[lang], true, true);
  }
  return i18n;
}

const LANG_KEY = 'bilig.admin.lang';
const readLang = (): AdminLang => {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'ky' || v === 'ru' ? v : 'ru';
  } catch {
    return 'ru';
  }
};

interface LangState {
  lang: AdminLang;
  setLang(lang: AdminLang): void;
}

export const useAdminLang = create<LangState>((set) => ({
  lang: readLang(),
  setLang(lang) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* per-viewer convenience only */
    }
    set({ lang });
  },
}));

export type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** `t` bound to the admin namespace and the admin language. */
export function useT(): TFn {
  const lang = useAdminLang((s) => s.lang);
  const { t } = useTranslation(ADMIN_NS, { lng: lang });
  return t as unknown as TFn;
}
