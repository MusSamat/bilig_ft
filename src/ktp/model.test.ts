import { describe, expect, it } from 'vitest';
import type { KtpRow, TeachingPlan } from '@bilig/content-model/api';
import {
  KTP_MAX_BYTES,
  applyRowPatches,
  chunkRange,
  dayKey,
  fixTarget,
  fromDmy,
  problemCounts,
  rowDiff,
  searchRows,
  sortProblems,
  toDmy,
  weekDays,
  checkKtpFile,
  filenameFromDisposition,
  groupBySection,
  indexRange,
  issueParams,
  lessonsBetween,
  rangeOk,
  shortDate,
  weekOf,
} from './model';

const row = (index: number, section?: string, dates: Record<string, string | null> = {}): KtpRow => ({
  index,
  number: index,
  ...(section ? { section: { title: section, hours: 2 } } : {}),
  title: `L${index}`,
  hours: 1,
  type: 'new',
  dates,
  homework: '',
  note: '',
  topicKey: null,
});

describe('ktp model', () => {
  it('checks the picked file before reading it', () => {
    expect(checkKtpFile(new File(['x'], 'plan.pdf'))).toBe('ktp.upload.notDocx');
    expect(checkKtpFile(new File([], 'plan.docx'))).toBe('ktp.upload.empty');
    expect(checkKtpFile(new File([new Uint8Array(KTP_MAX_BYTES + 1)], 'plan.DOCX'))).toBe('ktp.upload.tooLarge');
    expect(checkKtpFile(new File(['PK'], 'КТП 8-класс.docx'))).toBeNull();
  });

  it('groups consecutive lessons by section', () => {
    const g = groupBySection([row(1), row(2, 'A'), row(3, 'A'), row(4, 'B')]);
    expect(g.map((x) => [x.title, x.rows.map((r) => r.index)])).toEqual([
      [null, [1]],
      ['A', [2, 3]],
      ['B', [4]],
    ]);
  });

  it('finds the week (Monday–Sunday) and its lessons for a class', () => {
    expect(weekOf('2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(weekOf('2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    const plan = { rows: [row(1, undefined, { a: '2026-10-26' }), row(2, undefined, { a: '2026-10-20' }), row(3, undefined, { a: null })] } as TeachingPlan;
    const week = lessonsBetween(plan, 'a', '2026-10-19', '2026-10-25');
    expect(week.map((r) => r.index)).toEqual([2]);
    expect(indexRange(week)).toEqual({ from: 2, to: 2 });
  });

  it('limits a range to KTP_MAX_RANGE lessons', () => {
    expect(rangeOk({ from: 1, to: 10 })).toBe(true);
    expect(rangeOk({ from: 1, to: 11 })).toBe(false);
    expect(rangeOk(null)).toBe(false);
  });

  it('shows ISO dates in issue params the way a КТП prints them', () => {
    expect(shortDate('2027-04-30')).toBe('30.04.27');
    expect(issueParams({ code: 'date_invalid', severity: 'error', row: 3, class: '8в', params: { date: '31.04.27' } })).toMatchObject({ date: '31.04.27', class: '8в', row: 3 });
    expect(issueParams({ code: 'date_order', severity: 'warning', params: { date: '2026-10-01', prev: '2026-10-05' } })).toMatchObject({ date: '01.10.26', prev: '05.10.26' });
  });

  it('applies row patches optimistically', () => {
    const plan = { rows: [row(1, undefined, { a: '2026-10-01', b: '2026-10-02' })] } as TeachingPlan;
    const next = applyRowPatches(plan, [{ index: 1, dates: { a: null }, topicKey: 'water', type: 'test' }]);
    expect(next.rows[0]).toMatchObject({ dates: { a: null, b: '2026-10-02' }, topicKey: 'water', type: 'test', match: { auto: false } });
    expect(applyRowPatches(next, [{ index: 1, topicKey: null }]).rows[0].match).toBeUndefined();
  });

  it('reads the server file name from Content-Disposition', () => {
    expect(filenameFromDisposition(`attachment; filename="plan.docx"; filename*=UTF-8''${encodeURIComponent('Сабак-планы_8б_1.docx')}`)).toBe('Сабак-планы_8б_1.docx');
    expect(filenameFromDisposition('attachment; filename="plan.docx"')).toBe('plan.docx');
    expect(filenameFromDisposition(null)).toBeNull();
  });

  it('reads and writes the dd.mm.yyyy date field', () => {
    expect(toDmy('2026-10-20')).toBe('20.10.2026');
    expect(toDmy(null)).toBe('');
    expect(fromDmy('20.10.2026')).toBe('2026-10-20');
    expect(fromDmy('1/9/26')).toBe('2026-09-01');
    expect(fromDmy('2026-10-20')).toBe('2026-10-20');
    expect(fromDmy('  ')).toBeNull();
    expect(fromDmy('31.04.2027')).toBeUndefined();
    expect(fromDmy('soon')).toBeUndefined();
  });

  it('names the school days in the UI language, Monday first', () => {
    expect(weekDays('2026-10-19')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(dayKey('2026-10-19')).toBe('ktp.weekday.1');
    expect(dayKey('2026-10-25')).toBe('ktp.weekday.0');
  });

  it('counts errors + warnings of every class and lists errors first', () => {
    const issues = [
      { code: 'hours_mismatch', severity: 'warning' },
      { code: 'date_same_day', severity: 'info', row: 2, class: 'a' },
      { code: 'date_holiday', severity: 'warning', row: 9, class: 'b' },
      { code: 'date_invalid', severity: 'error', row: 12, class: 'a' },
    ] as const;
    expect(problemCounts([...issues])).toEqual({ errors: 1, warnings: 2 });
    expect(sortProblems([...issues]).map((i) => i.code)).toEqual(['date_invalid', 'hours_mismatch', 'date_holiday']);
    expect(fixTarget(issues[3])).toEqual({ lesson: '12', at: 'a' });
    expect(fixTarget({ code: 'section_hours_mismatch', severity: 'warning', row: 128 })).toEqual({ view: 'all', section: '128' });
    expect(fixTarget(issues[0])).toBeNull();
  });

  it('splits a long range into files of at most KTP_MAX_RANGE lessons', () => {
    expect(chunkRange({ from: 21, to: 24 })).toEqual([{ from: 21, to: 24 }]);
    expect(chunkRange({ from: 1, to: 23 })).toEqual([
      { from: 1, to: 10 },
      { from: 11, to: 20 },
      { from: 21, to: 23 },
    ]);
  });

  it('sends only what the sheet changed', () => {
    const r = row(4, undefined, { a: '2026-10-01', b: null });
    expect(rowDiff(r, { title: 'L4', type: 'new', hours: 1, homework: '', topicKey: null, dates: { a: '2026-10-01', b: null } })).toBeNull();
    expect(rowDiff(r, { title: 'L4', type: 'test', hours: 1, homework: '§2', topicKey: null, dates: { a: '2026-10-01', b: '2026-10-02' } })).toEqual({ index: 4, type: 'test', homework: '§2', dates: { b: '2026-10-02' } });
  });

  it('searches lessons by topic, section or number', () => {
    const rows = [row(1, 'Сан'), { ...row(2, 'Сан'), title: 'Катыштар' }, row(3, 'Бөлчөк')];
    expect(searchRows(rows, 'катыш', 'ky').map((r) => r.index)).toEqual([2]);
    expect(searchRows(rows, 'бөлчөк', 'ky').map((r) => r.index)).toEqual([3]);
    expect(searchRows(rows, '1', 'ky').map((r) => r.index)).toEqual([1]);
    expect(searchRows(rows, ' ', 'ky')).toHaveLength(3);
  });
});
