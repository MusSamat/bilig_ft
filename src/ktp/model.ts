/**
 * Pure helpers for the КТП screens (contract 0.5.0): school-local dates and
 * weeks, day names in the UI language, the problem count every screen shows,
 * sections, search, optimistic patches and the upload checks.
 */
import { fmtDate } from '../lib/format';
import { KTP_MAX_BYTES, KTP_MAX_RANGE, type KtpIssue, type KtpRow, type KtpRowPatch, type TeachingPlan } from '@bilig/content-model/api';

export { KTP_MAX_BYTES, KTP_MAX_RANGE };

/* ------------------------------------------------------------------ dates */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date `YYYY-MM-DD` (not UTC: a lesson day is a school-local day). */
export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = (): string => isoDay(new Date());

export const parseIso = (iso: string): Date | null => {
  const m = ISO.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
};

export const addDays = (iso: string, n: number): string => {
  const d = parseIso(iso) ?? new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: string): number | null => parseIso(iso)?.getDay() ?? null;

/** Monday … Sunday of the week that contains `iso`. */
export function weekOf(iso: string): { from: string; to: string } {
  const d = parseIso(iso) ?? new Date();
  const from = addDays(isoDay(d), -((d.getDay() + 6) % 7));
  return { from, to: addDays(from, 6) };
}

/** The seven days of the week that starts on `monday`. */
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** `2027-04-30` → `30.04.27` — the way dates are printed in a КТП (issue params). */
export const shortDate = (iso: string): string => {
  const m = ISO.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : iso;
};

/** `2026-10-20` → `20.10.2026` (what the date field shows and accepts). */
export const toDmy = (iso: string | null | undefined): string => {
  const m = iso ? ISO.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

/**
 * `20.10.2026`, `20/10/2026`, `20-10-26`, `2026-10-20` → `2026-10-20`;
 * `''` → null (no date); anything impossible → undefined.
 */
export function fromDmy(text: string): string | null | undefined {
  const s = text.trim();
  if (!s) return null;
  if (ISO.test(s)) return parseIso(s) ? s : undefined;
  const m = /^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{2}|\d{4})$/.exec(s);
  if (!m) return undefined;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return parseIso(iso) ? iso : undefined;
}

/** i18n key of the weekday name («Дүйшөмбү», «Понедельник», «Monday»): `t(dayKey(iso))`. */
export const dayKey = (iso: string): string => `ktp.weekday.${weekday(iso) ?? 1}`;

/** «20-октябрь» / «20 октября» / «20 October». */
export const dayMonth = (lang: string, iso: string): string => {
  const d = parseIso(iso);
  return d ? fmtDate(d, lang, { noYear: true }) : iso;
};

/** «20-октябрь, 2026» / «20 октября 2026 г.». */
export const fullDate = (lang: string, iso: string): string => {
  const d = parseIso(iso);
  return d ? fmtDate(d, lang) : iso;
};

/** Fixed-date public holidays of Kyrgyzstan (MM-DD), as the server checks them. */
const KG_HOLIDAYS = ['01-01', '01-07', '02-23', '03-08', '03-21', '05-01', '05-05', '05-09', '08-31', '11-07', '11-08'];
export const isHoliday = (iso: string): boolean => KG_HOLIDAYS.includes(iso.slice(5));

/* ----------------------------------------------------------------- issues */

/** Issue params ready for interpolation: ISO dates shown as in the КТП. */
export function issueParams(issue: KtpIssue): Record<string, string | number> {
  const out: Record<string, string | number> = { class: issue.class ?? '', row: issue.row ?? '' };
  for (const [k, v] of Object.entries(issue.params ?? {})) out[k] = typeof v === 'string' && ISO.test(v) ? shortDate(v) : v;
  return out;
}

/** A «problem» is an error or a warning; info notes (a double lesson) are not. */
export const isProblem = (i: KtpIssue): boolean => i.severity !== 'info';

/**
 * THE problem count: errors and warnings of the whole plan, every class. The
 * list (server summary), the upload summary and the plan page all show this.
 */
export const problemCounts = (issues: KtpIssue[]): { errors: number; warnings: number } => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
});

/** Errors first, then warnings, each in lesson order (plan-wide ones first); info dropped. */
export const sortProblems = (issues: KtpIssue[]): KtpIssue[] =>
  issues.filter(isProblem).sort((a, b) => (a.severity === b.severity ? (a.row ?? 0) - (b.row ?? 0) : a.severity === 'error' ? -1 : 1));

/** Problems shown on a lesson (section hours belong to the section heading). `cls` limits to one class. */
export const lessonProblems = (issues: KtpIssue[], index: number, cls?: string): KtpIssue[] =>
  sortProblems(issues.filter((i) => i.row === index && i.code !== 'section_hours_mismatch' && (!cls || !i.class || i.class === cls)));

/** Where «Fix» takes the teacher: the lesson sheet, the section in «All lessons», or nowhere (plan-wide). */
export function fixTarget(i: KtpIssue): Record<string, string> | null {
  if (i.row === undefined) return null;
  if (i.code === 'section_hours_mismatch') return { view: 'all', section: String(i.row) };
  return { lesson: String(i.row), ...(i.class ? { at: i.class } : {}) };
}

/* ---------------------------------------------------------------- lessons */

export interface SectionGroup {
  /** Index of the first lesson (stable key, and what a section issue points at). */
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
    else out.push({ key: `${r.index}`, title, hours: r.section?.hours ?? null, rows: [r] });
  }
  return out;
}

/** Lessons whose title, section or homework contains `q` (case-insensitive), or whose number is `q`. */
export function searchRows(rows: KtpRow[], q: string, lang: string): KtpRow[] {
  const needle = q.trim().toLocaleLowerCase(lang);
  if (!needle) return rows;
  return rows.filter((r) => String(r.index) === needle || [r.title, r.section?.title ?? '', r.homework].some((s) => s.toLocaleLowerCase(lang).includes(needle)));
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

/** The first lesson of a class strictly after `iso`. */
export const nextLesson = (plan: TeachingPlan, cls: string, iso: string): KtpRow | undefined => lessonsBetween(plan, cls, addDays(iso, 1), '9999-12-31')[0];
/** The last lesson of a class strictly before `iso`. */
export const prevLesson = (plan: TeachingPlan, cls: string, iso: string): KtpRow | undefined => lessonsBetween(plan, cls, '0000-01-01', addDays(iso, -1)).pop();

/** Index range covering `rows` (the range endpoint takes `from..to` by index). */
export function indexRange(rows: KtpRow[]): { from: number; to: number } | null {
  if (!rows.length) return null;
  const idx = rows.map((r) => r.index);
  return { from: Math.min(...idx), to: Math.max(...idx) };
}

export const rangeSize = (r: { from: number; to: number }): number => r.to - r.from + 1;
export const rangeOk = (r: { from: number; to: number } | null): r is { from: number; to: number } => !!r && r.from >= 1 && r.to >= r.from && rangeSize(r) <= KTP_MAX_RANGE;

/** A range split into files of at most KTP_MAX_RANGE lessons. */
export function chunkRange(r: { from: number; to: number }, max = KTP_MAX_RANGE): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let f = r.from; f <= r.to; f += max) out.push({ from: f, to: Math.min(r.to, f + max - 1) });
  return out;
}

/** First letter up («алгебра» → «Алгебра»). */
export const capitalize = (s: string, lang: string): string => (s ? s.charAt(0).toLocaleUpperCase(lang) + s.slice(1) : s);

/** Apply row patches locally (optimistic UI); the server's response replaces this. */
export function applyRowPatches(plan: TeachingPlan, patches: KtpRowPatch[]): TeachingPlan {
  const byIndex = new Map(patches.map((p) => [p.index, p]));
  return {
    ...plan,
    rows: plan.rows.map((r) => {
      const p = byIndex.get(r.index);
      if (!p) return r;
      const { index: _i, dates, topicKey, ...rest } = p;
      const next: KtpRow = { ...r, ...rest, ...(dates ? { dates: { ...r.dates, ...dates } } : {}) };
      if (topicKey !== undefined) {
        next.topicKey = topicKey;
        if (topicKey === null) delete next.match;
        else next.match = { auto: false, score: 1 };
      }
      return next;
    }),
  };
}

/** The fields of `draft` that differ from `row` — what the lesson sheet sends. */
export function rowDiff(row: KtpRow, draft: Omit<KtpRowPatch, 'index'>): KtpRowPatch | null {
  const out: Record<string, unknown> = { index: row.index };
  let changed = false;
  for (const k of ['title', 'type', 'hours', 'homework', 'topicKey'] as const) {
    if (draft[k] !== undefined && draft[k] !== row[k]) {
      out[k] = draft[k];
      changed = true;
    }
  }
  if (draft.dates) {
    const dates = Object.fromEntries(Object.entries(draft.dates).filter(([c, d]) => (row.dates[c] ?? null) !== d));
    if (Object.keys(dates).length) {
      out.dates = dates;
      changed = true;
    }
  }
  return changed ? (out as KtpRowPatch) : null;
}

/* ----------------------------------------------------------------- upload */

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

export { filenameFromDisposition } from '../lib/download';

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
