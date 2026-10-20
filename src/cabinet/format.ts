/** Formatting helpers for cabinets (Intl in the UI language, TZ §10) and error → i18n key. */
import { fmtDate } from '../lib/format';
import { isApiError } from '../api/client';

/** A date in the UI language (Intl, with the Kyrgyz fallback of `lib/format`). */
export const formatDate = (lang: string, iso: string, withTime = false): string => fmtDate(iso, lang, { time: withTime });

export const formatPercent = (lang: string, v: number): string =>
  new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(v);

/** i18n key for any thrown error (problem+json i18nKey, offline, or generic). */
export function errorKey(e: unknown): string {
  if (isApiError(e)) return e.i18nKey;
  return 'common.error';
}

/** Read a picked file as text (FileReader works in every browser and in jsdom). */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
