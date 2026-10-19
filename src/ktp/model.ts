/**
 * Pure helpers for the КТП screens (contract 0.5.0): dates by class, the
 * current week, sections, issues per lesson, optimistic patches, upload checks.
 */
import { KTP_MAX_BYTES, KTP_MAX_RANGE, type KtpIssue, type KtpRow, type KtpRowPatch, type TeachingPlan } from '@bilig/content-model/api';

export { KTP_MAX_BYTES, KTP_MAX_RANGE };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date `YYYY-MM-DD` (not UTC: a lesson day is a school-local day). */
export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = (): string => isoDay(new Date());

const parseIso = (iso: string): Date | null => {
  const m = ISO.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: string): number | null => parseIso(iso)?.getDay() ?? null;
export const isSaturday = (iso: string | null | undefined): boolean => !!iso && weekday(iso) === 6;

/** Monday … Sunday of the week that contains `iso`. */
export function weekOf(iso: string): { from: string; to: string } {
  const d = parseIso(iso) ?? new Date();
  const back = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { from: isoDay(mon), to: isoDay(sun) };
}

/** `2027-04-31` → `31.04.27` — the way dates are printed in a КТП. */
export const shortDate = (iso: string): string => {
  const m = ISO.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : iso;
};

/** Long localized date for headings («пн, 19 окт.»). */
export const longDate = (lang: string, iso: string): string => {
  const d = parseIso(iso);
  return d
    ? new Intl.DateTimeFormat(lang, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(d)
    : iso;
};

/** Issue params ready for interpolation: ISO dates shown as in the КТП. */
export function issueParams(issue: KtpIssue): Record<string, string | number> {
  const out: Record<string, string | number> = {
    class: issue.class ?? '',
    row: issue.row ?? '',
  };
  for (const [k, v] of Object.entries(issue.params ?? {})) out[k] = typeof v === 'string' && ISO.test(v) ? shortDate(v) : v;
  return out;
}

/** Issues about one lesson for one class (or for every class). */
export const rowIssues = (issues: KtpIssue[], index: number, cls?: string): KtpIssue[] => issues.filter((i) => i.row === index && (!i.class || !cls || i.class === cls));

/** Issues about the whole plan (no lesson). */
export const planIssues = (issues: KtpIssue[]): KtpIssue[] => issues.filter((i) => i.row === undefined);

export const countBySeverity = (issues: KtpIssue[]) => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
  infos: issues.filter((i) => i.severity === 'info').length,
});

/** A lesson «has a problem» for the filter: an error or a warning (info is not a problem). */
export const isProblem = (i: KtpIssue): boolean => i.severity !== 'info';

export interface SectionGroup {
  key: string;
  title: string | null;
  hours: number | null;
  rows: KtpRow[];
}

/** Consecutive lessons of one section form a group (lessons before the first heading form an untitled one). */
export function groupBySection(rows: KtpRow[]): SectionGroup[] {
  const out: SectionGroup[] = [];
  for (const r of rows) {
    const title = r.section?.title ?? null;
    const last = out[out.length - 1];
    if (last && last.title === title) last.rows.push(r);
    else
      out.push({
        key: `${r.index}`,
        title,
        hours: r.section?.hours ?? null,
        rows: [r],
      });
  }
  return out;
}

/** Lessons of a class in `[from, to]` (by date), in date order. */
export function lessonsBetween(plan: TeachingPlan, cls: string, from: string, to: string): KtpRow[] {
  return plan.rows
    .filter((r) => {
      const d = r.dates[cls];
      return !!d && d >= from && d <= to;
    })
    .sort((a, b) => (a.dates[cls]! < b.dates[cls]! ? -1 : a.dates[cls]! > b.dates[cls]! ? 1 : a.index - b.index));
}

/** The first lesson of a class after `iso`. */
export const nextLesson = (plan: TeachingPlan, cls: string, iso: string): KtpRow | undefined => lessonsBetween(plan, cls, iso, '9999-12-31').find((r) => r.dates[cls]! > iso);

/** Index range covering `rows` (the range endpoint takes `from..to` by index). */
export function indexRange(rows: KtpRow[]): { from: number; to: number } | null {
  if (!rows.length) return null;
  const idx = rows.map((r) => r.index);
  return { from: Math.min(...idx), to: Math.max(...idx) };
}

export const rangeSize = (r: { from: number; to: number }): number => r.to - r.from + 1;
export const rangeOk = (r: { from: number; to: number } | null): r is { from: number; to: number } => !!r && r.from >= 1 && r.to >= r.from && rangeSize(r) <= KTP_MAX_RANGE;

/** Apply row patches locally (optimistic UI); the server's response replaces this. */
export function applyRowPatches(plan: TeachingPlan, patches: KtpRowPatch[]): TeachingPlan {
  const byIndex = new Map(patches.map((p) => [p.index, p]));
  return {
    ...plan,
    rows: plan.rows.map((r) => {
      const p = byIndex.get(r.index);
      if (!p) return r;
      const { index: _i, dates, topicKey, ...rest } = p;
      const next: KtpRow = {
        ...r,
        ...rest,
        ...(dates ? { dates: { ...r.dates, ...dates } } : {}),
      };
      if (topicKey !== undefined) {
        next.topicKey = topicKey;
        if (topicKey === null) delete next.match;
        else next.match = { auto: false, score: 1 };
      }
      return next;
    }),
  };
}

/** Client-side checks before reading the file. Returns an i18n key or null. */
export function checkKtpFile(file: File): string | null {
  if (!/\.docx$/i.test(file.name)) return 'ktp.upload.notDocx';
  if (file.size === 0) return 'ktp.upload.empty';
  if (file.size > KTP_MAX_BYTES) return 'ktp.upload.tooLarge';
  return null;
}

/** File → base64 (no `data:` prefix). FileReader works in every browser and in jsdom. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Server file name from Content-Disposition (`filename*=UTF-8''…` preferred). */
export function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain name */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(cd);
  return plain ? plain[1].trim() : null;
}

const LAST_CLASS = (id: string) => `bilig.ktp.class.${id}`;
export function rememberClass(planId: string, cls: string): void {
  try {
    localStorage.setItem(LAST_CLASS(planId), cls);
  } catch {
    /* storage blocked */
  }
}
export function lastClass(planId: string, classes: string[]): string | undefined {
  try {
    const v = localStorage.getItem(LAST_CLASS(planId));
    if (v && classes.includes(v)) return v;
  } catch {
    /* storage blocked */
  }
  return classes[0];
}
