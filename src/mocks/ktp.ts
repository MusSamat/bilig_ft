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
  for (const r of plan.rows) {
    if (!r.title.trim()) out.push({ code: 'title_missing', severity: 'warning', row: r.index });
  }
  for (const cls of plan.classes) {
    let prev: string | null = null;
    for (const r of plan.rows) {
      const d = r.dates[cls] ?? null;
      const raw = plan.raw[String(r.index)]?.[cls];
      if (!d) {
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
