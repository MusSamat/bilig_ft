/**
 * Formatting in the UI language (TZ §10, audit G-1 / P-7 / DS-8): dates through
 * Intl with a Kyrgyz fallback, and measurement units through one glossary, so
 * no English abbreviation (bpm, mL, mmHg, AM/PM…) reaches a ky/ru screen.
 */

import i18n from 'i18next';
import { formatPropValue, propertyType, type ConceptProp, type Lang, type PropertyTypeDef } from '@bilig/content-model';

type UiLang = Lang | (string & {});

/* ------------------------------------------------------------------ dates */

/** Month and weekday names from `calendar.json` (for browsers whose Intl lacks the language). */
const calendar = (lang: string, key: 'months' | 'weekdays'): string[] => i18n.t(`calendar.${key}`, { lng: lang }).split(',');

/** Does this browser's Intl have date data for `lang`? (several Chromium builds lack Kyrgyz). */
export function intlHasLocale(lang: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([lang]).length > 0;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface DateOpts {
  /** Add the time (24-hour clock everywhere). */
  time?: boolean;
  /** Short weekday heading form: «шей, 19-октябрь». */
  weekday?: boolean;
  /** Omit the year. */
  noYear?: boolean;
}

/**
 * A date in the UI language: ky «17-июнь, 2027», ru «17 июня 2027 г.», en «17 June 2027».
 * Falls back to explicit Kyrgyz names when Intl has no `ky` data; never prints AM/PM.
 */
export function fmtDate(value: Date | string | number, lang: UiLang, opts: DateOpts = {}): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = opts.time ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  if (lang === 'ky' && !intlHasLocale('ky')) {
    const day = `${d.getDate()}-${calendar('ky', 'months')[d.getMonth()]}`;
    if (opts.weekday) return `${calendar('ky', 'weekdays')[d.getDay()]}, ${day}${time}`;
    return `${day}${opts.noYear ? '' : `, ${d.getFullYear()}`}${time}`;
  }
  const locale = intlHasLocale(lang) ? lang : 'ru';
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: opts.weekday ? 'short' : 'long',
    ...(opts.weekday ? { weekday: 'short' as const } : {}),
    ...(opts.noYear || opts.weekday ? {} : { year: 'numeric' as const }),
  }).format(d);
  return date + time;
}

/* ------------------------------------------------------------------ units */

/**
 * Unit glossary: `src/locales/<lang>/units.json`, keyed by the symbols the
 * content and plugins use. Kyrgyz follows the school textbooks: SI symbols in
 * Cyrillic as in Russian (м, кг, Дж, Н…), Kyrgyz words where the textbooks
 * use them (мүн, саат, жыл, күн, сокку, мм сым. мам.).
 */
const glossary = (lang: string): Record<string, string> => (i18n.getResource(lang, 'translation', 'units') as Record<string, string> | undefined) ?? {};

/** Trailing superscript of a unit part (m², cm³, s²). */
const SUPERSCRIPT = /([²³¹⁰⁴-⁹]+)$/;

function part(token: string, lang: 'ru' | 'ky'): string | undefined {
  const sup = token.match(SUPERSCRIPT)?.[1] ?? '';
  const base = sup ? token.slice(0, -sup.length) : token;
  const hit = glossary(lang)[base];
  return hit ? hit + sup : undefined;
}

/**
 * A unit symbol in the UI language: `unitLabel('bpm', 'ru')` → «уд/мин»,
 * `unitLabel('m/s²', 'ky')` → «м/с²». English keeps the symbol; an unknown unit
 * is returned unchanged (°, %, already-localized strings).
 */
export function unitLabel(unit: string | undefined | null, lang: UiLang): string {
  if (!unit) return '';
  if (lang !== 'ru' && lang !== 'ky') return unit;
  const l = lang as 'ru' | 'ky';
  const whole = part(unit, l);
  if (whole) return whole;
  if (unit.includes('/')) {
    const parts = unit.split('/').map((p) => part(p.trim(), l));
    if (parts.every(Boolean)) return parts.join('/');
  }
  return unit;
}

/** «40 уд/мин», «≈120 мм рт. ст.» — a number already formatted in the UI language plus its unit. */
export function withUnit(value: string, unit: string | undefined | null, lang: UiLang): string {
  const u = unitLabel(unit, lang);
  if (!u) return value;
  return /^[°%′″]/.test(u) ? `${value}${u}` : `${value} ${u}`;
}

/**
 * A concept property value in the UI language — `formatPropValue` of the content
 * model, with the unit passed through the glossary («≈120 мм рт. ст.»).
 */
export function formatProp(prop: ConceptProp, lang: Lang, extra: readonly PropertyTypeDef[] = []): string {
  if (prop.kind !== 'quantity') return formatPropValue(prop, lang, extra);
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 4 });
  const num = (prop.approx ? '≈' : '') + nf.format(prop.value) + (prop.max !== undefined ? `–${nf.format(prop.max)}` : '');
  return withUnit(num, prop.unit ?? propertyType(prop.type, extra)?.unit, lang);
}
