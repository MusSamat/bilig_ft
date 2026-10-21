/**
 * DEV/TEST-ONLY: the mock КТП (contract 0.5.0). `content/ktp-plan.json` is a real
 * 8th-grade algebra КТП (2026–2027, classes 8б and 8в) parsed by the reference
 * prototype and converted to the contract shape (global index, sections split
 * off «Сан (10 саат) / Сандар системасы»). Issues are recomputed here the way
 * the server does after every upload and PATCH.
 */
import type { KtpIssue, KtpRow, TeachingPlan } from '@bilig/content-model/api';
import fixture from './content/ktp-plan.json';

/** Stored plan: the contract shape + the raw text of impossible dates (`index → class → '31.04.27'`). */
export type MockKtpPlan = TeachingPlan & {
  raw: Record<string, Record<string, string>>;
};

/** Fixed-date public holidays of Kyrgyzstan (MM-DD). */
const HOLIDAYS = ['01-01', '01-07', '02-23', '03-08', '03-21', '05-01', '05-05', '05-09', '08-31', '11-07', '11-08'];

const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export function computeIssues(plan: Omit<MockKtpPlan, 'issues'>): KtpIssue[] {
  const out: KtpIssue[] = [];
  if (!plan.rows.length) return [{ code: 'no_lessons', severity: 'error' }];
  const total = plan.rows.reduce((n, r) => n + r.hours, 0);
  if (plan.declaredHours !== null && plan.declaredHours !== total) {
    out.push({
      code: 'hours_mismatch',
      severity: 'warning',
      params: { declared: plan.declaredHours, actual: total },
    });
  }
  // Sections: «Сан (10 саат)» against the hours of its lessons.
  let i = 0;
  while (i < plan.rows.length) {
    const s = plan.rows[i].section;
    let j = i;
    let hours = 0;
    while (j < plan.rows.length && plan.rows[j].section?.title === s?.title) hours += plan.rows[j++].hours;
    if (s?.hours !== undefined && s.hours !== hours) {
      out.push({
        code: 'section_hours_mismatch',
        severity: 'warning',
        row: plan.rows[i].index,
        params: { section: s.title, declared: s.hours, actual: hours },
      });
    }
    i = j;
  }
  const y = plan.year;
  // v0.9.2: a preliminary КТП (from a textbook) has no dates by design — no «date missing» there.
  const preliminary = /\((алдын ала|предварительный|draft)\)\s*$/.test(plan.title);
  for (const r of plan.rows) {
    if (!r.title.trim()) out.push({ code: 'title_missing', severity: 'warning', row: r.index });
  }
  for (const cls of plan.classes) {
    let prev: string | null = null;
    for (const r of plan.rows) {
      const d = r.dates[cls] ?? null;
      const raw = plan.raw[String(r.index)]?.[cls];
      if (!d) {
        if (!raw && preliminary) continue;
        out.push(
          raw
            ? {
                code: 'date_invalid',
                severity: 'error',
                row: r.index,
                class: cls,
                params: { date: raw },
              }
            : {
                code: 'date_missing',
                severity: 'warning',
                row: r.index,
                class: cls,
              },
        );
        continue;
      }
      if (prev && d < prev)
        out.push({
          code: 'date_order',
          severity: 'warning',
          row: r.index,
          class: cls,
          params: { date: d, prev },
        });
      else if (prev && d === prev)
        out.push({
          code: 'date_same_day',
          severity: 'info',
          row: r.index,
          class: cls,
          params: { date: d },
        });
      if (dow(d) === 0)
        out.push({
          code: 'date_sunday',
          severity: 'error',
          row: r.index,
          class: cls,
          params: { date: d },
        });
      if (HOLIDAYS.includes(d.slice(5)))
        out.push({
          code: 'date_holiday',
          severity: 'warning',
          row: r.index,
          class: cls,
          params: { date: d },
        });
      if (y && (d < `${y}-09-01` || d > `${y + 1}-06-30`))
        out.push({
          code: 'date_out_of_year',
          severity: 'warning',
          row: r.index,
          class: cls,
          params: { date: d },
        });
      prev = d;
    }
  }
  return out;
}

type FixtureRow = Omit<KtpRow, 'type'> & {
  type: KtpRow['type'];
  invalid?: Record<string, string>;
};

/** A fresh plan from the fixture (upload result / seed). */
export function buildKtpPlan(id: string, ownerId: string, sourceName: string, at = new Date().toISOString()): MockKtpPlan {
  const raw: MockKtpPlan['raw'] = {};
  const rows: KtpRow[] = (fixture.rows as unknown as FixtureRow[]).map(({ invalid, ...r }) => {
    if (invalid) {
      raw[String(r.index)] = { ...invalid }; // a copy: PATCH deletes from it, the fixture must stay intact
      return {
        ...r,
        dates: Object.fromEntries(Object.entries(r.dates).map(([c, d]) => [c, invalid[c] ? null : d])),
      };
    }
    return r;
  });
  const m = fixture.meta;
  const base = {
    id,
    ownerId,
    title: m.title,
    subjectName: m.subjectName,
    subjectKey: 'math',
    grade: m.grade,
    lang: 'ky' as const,
    teacherName: m.teacherName,
    schoolName: m.schoolName,
    year: m.year,
    classes: m.classes,
    // v0.8.0: no column is linked to a class until the upload matches names (or the teacher links it).
    classLinks: Object.fromEntries(m.classes.map((c) => [c, null])) as Record<string, string | null>,
    declaredHours: m.declaredHours,
    totalHours: rows.reduce((n, r) => n + r.hours, 0),
    rows,
    raw,
    sourceName,
    createdAt: at,
    updatedAt: at,
    version: 1,
  };
  return { ...base, issues: computeIssues(base) };
}

/** v0.8.0: a КТП column matches a class by name, case and spaces ignored («8б» = «8 Б»). */
export const sameClassName = (a: string, b: string): boolean => a.replace(/\s+/g, '').toLocaleLowerCase() === b.replace(/\s+/g, '').toLocaleLowerCase();

/** Contract DTO (without the mock-only raw dates). */
export const planDto = ({ raw: _raw, ...p }: MockKtpPlan): TeachingPlan => p;

export function planSummary(p: MockKtpPlan) {
  return {
    id: p.id,
    title: p.title,
    subjectName: p.subjectName,
    subjectKey: p.subjectKey,
    grade: p.grade,
    lang: p.lang,
    classes: p.classes,
    totalHours: p.totalHours,
    updatedAt: p.updatedAt,
    version: p.version,
    lessons: p.rows.length,
    errors: p.issues.filter((i) => i.severity === 'error').length,
    warnings: p.issues.filter((i) => i.severity === 'warning').length,
  };
}

/* ---------------------------------------------- v0.9.2: КТП from a textbook */

export interface BookLine {
  chapter: { number: string; title: string };
  number: string;
  kind: 'lesson' | 'review' | 'extra';
  title: string;
  pages?: { from: number; to: number };
  topicKey: string | null;
}

const DRAFT_MARK = { ky: '(алдын ала)', ru: '(предварительный)', en: '(draft)' } as const;
const PRACTICE = { ky: 'Маселелер чыгаруу', ru: 'Решение задач', en: 'Problem solving' } as const;
const GRADE = { ky: (g: number) => `${g}-класс`, ru: (g: number) => `${g} класс`, en: (g: number) => `grade ${g}` } as const;
const homeworkOf = (lang: 'ky' | 'ru' | 'en', l: BookLine) => {
  const p = l.pages ? (lang === 'ky' ? `${l.pages.from}–${l.pages.to}-беттер` : lang === 'ru' ? `с. ${l.pages.from}–${l.pages.to}` : `pp. ${l.pages.from}–${l.pages.to}`) : '';
  return [l.number ? `§ ${l.number}` : '', p].filter(Boolean).join(', ');
};

/**
 * A preliminary КТП the way the server makes one: the book's lines in order, one
 * lesson each; extra hours (hours a week × weeks > lines) go to «problem solving»
 * lessons after the longest §§; fewer hours keep every line and say so
 * (hours_mismatch). No dates: every class column is empty for the teacher to fill in.
 */
export function buildFromTextbook(o: {
  id: string;
  ownerId: string;
  lines: BookLine[];
  subjectKey: string | null;
  subjectName: string;
  grade: number | null;
  lang: 'ky' | 'ru' | 'en';
  year: number;
  classes: string[];
  hoursPerWeek: number;
  weeks: number;
  sourceName: string;
}): MockKtpPlan {
  const total = o.hoursPerWeek * o.weeks;
  const extra = Math.max(0, total - o.lines.length);
  // Which lines get a practice lesson after them: the longest lessons first, round-robin.
  const lessons = o.lines.map((l, i) => ({ i, len: l.kind === 'lesson' ? (l.pages ? l.pages.to - l.pages.from + 1 : 1) : -1 })).filter((x) => x.len >= 0).sort((a, b) => b.len - a.len || a.i - b.i);
  const practice = new Map<number, number>();
  for (let k = 0; k < extra && lessons.length; k++) {
    const at = lessons[k % lessons.length].i;
    practice.set(at, (practice.get(at) ?? 0) + 1);
  }
  const rows: KtpRow[] = [];
  const empty = () => Object.fromEntries(o.classes.map((c) => [c, null])) as Record<string, string | null>;
  o.lines.forEach((l, i) => {
    const section = { title: `${l.chapter.number}. ${l.chapter.title}` };
    const base = { section, hours: 1, dates: empty(), note: '', topicKey: l.topicKey, ...(l.topicKey ? { match: { auto: true, score: 0.9 } } : {}) };
    rows.push({ ...base, index: rows.length + 1, number: rows.length + 1, title: l.title, type: l.kind === 'review' ? 'test' : l.kind === 'extra' ? 'practice' : 'new', homework: homeworkOf(o.lang, l) });
    for (let k = 0; k < (practice.get(i) ?? 0); k++) rows.push({ ...base, dates: empty(), index: rows.length + 1, number: rows.length + 1, title: `${PRACTICE[o.lang]}: ${l.title}`, type: 'practice', homework: homeworkOf(o.lang, l) });
  });
  // Section hours as a КТП prints them («Механика (12 саат)»).
  const hours = new Map<string, number>();
  for (const r of rows) hours.set(r.section!.title, (hours.get(r.section!.title) ?? 0) + 1);
  for (const r of rows) r.section = { title: r.section!.title, hours: hours.get(r.section!.title) };
  const at = new Date().toISOString();
  const what = [o.subjectName, o.grade ? GRADE[o.lang](o.grade) : null].filter(Boolean).join(', ');
  const base = {
    id: o.id,
    ownerId: o.ownerId,
    title: `${what}, ${o.year}–${o.year + 1} ${DRAFT_MARK[o.lang]}`,
    subjectName: o.subjectName,
    subjectKey: o.subjectKey,
    grade: o.grade,
    lang: o.lang,
    teacherName: '',
    schoolName: '',
    year: o.year,
    classes: o.classes,
    classLinks: Object.fromEntries(o.classes.map((c) => [c, null])) as Record<string, string | null>,
    declaredHours: total,
    totalHours: rows.length,
    rows,
    raw: {},
    sourceName: o.sourceName,
    createdAt: at,
    updatedAt: at,
    version: 1,
  };
  return { ...base, issues: computeIssues(base) };
}
