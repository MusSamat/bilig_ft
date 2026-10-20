import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConceptProp } from '@bilig/content-model';
import '../i18n';
import { fmtDate, formatProp, unitLabel, withUnit } from './format';

describe('unitLabel — units in the UI language (audit P-7)', () => {
  it('maps the English symbols of the content to ru and ky school terms', () => {
    expect(unitLabel('bpm', 'ru')).toBe('уд/мин');
    expect(unitLabel('bpm', 'ky')).toBe('сокку/мүн');
    expect(unitLabel('mL', 'ru')).toBe('мл');
    expect(unitLabel('mmHg', 'ru')).toBe('мм рт. ст.');
    expect(unitLabel('mmHg', 'ky')).toBe('мм сым. мам.');
    expect(unitLabel('km/h', 'ru')).toBe('км/ч');
    expect(unitLabel('km/h', 'ky')).toBe('км/саат');
  });
  it('composes compound units and keeps superscripts', () => {
    expect(unitLabel('m/s²', 'ru')).toBe('м/с²');
    expect(unitLabel('cm³', 'ky')).toBe('см³');
    expect(unitLabel('kJ/mol', 'ru')).toBe('кДж/моль');
  });
  it('keeps English and unknown or symbolic units unchanged', () => {
    expect(unitLabel('bpm', 'en')).toBe('bpm');
    expect(unitLabel('°', 'ru')).toBe('°');
    expect(unitLabel('%', 'ky')).toBe('%');
    expect(unitLabel(undefined, 'ru')).toBe('');
  });
  it('joins value and unit with a no-break space (none before ° and %)', () => {
    expect(withUnit('40', 'bpm', 'ru')).toBe('40 уд/мин');
    expect(withUnit('30', '°', 'ru')).toBe('30°');
  });
  it('formats a quantity property with a localized unit and Intl number', () => {
    const p: ConceptProp = { kind: 'quantity', type: 'pressure', value: 120, unit: 'mmHg', approx: true };
    expect(formatProp(p, 'ru')).toBe('≈120 мм рт. ст.');
    expect(formatProp(p, 'en')).toBe('≈120 mmHg');
    const range: ConceptProp = { kind: 'quantity', type: 'length', value: 3, max: 5, unit: 'mm' };
    expect(formatProp(range, 'ky')).toBe('3–5 мм');
  });
});

describe('fmtDate — dates in the UI language (audit G-1)', () => {
  const d = new Date(2027, 5, 17, 8, 42);
  afterEach(() => vi.restoreAllMocks());

  it('uses Intl in ru and en with a 24-hour clock', () => {
    expect(fmtDate(d, 'ru')).toMatch(/17 июня 2027/);
    expect(fmtDate(d, 'en')).toMatch(/17 June 2027|June 17, 2027/);
    expect(fmtDate(d, 'en', { time: true })).toMatch(/08:42$/);
    expect(fmtDate(d, 'en', { time: true })).not.toMatch(/AM|PM/);
  });
  it('falls back to Kyrgyz month and weekday names when Intl has no ky data', () => {
    vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation((l) => ([] as string[]).concat(l as string).filter((x) => x !== 'ky'));
    expect(fmtDate(d, 'ky')).toBe('17-июнь, 2027');
    expect(fmtDate(new Date(2026, 9, 19), 'ky', { weekday: true })).toBe('дүй, 19-октябрь');
    expect(fmtDate(d, 'ky', { time: true, noYear: true })).toBe('17-июнь 08:42');
  });
  it('never prints English for ky', () => {
    expect(fmtDate(d, 'ky')).not.toMatch(/Jun/);
  });
  it('returns an empty string for an invalid date', () => {
    expect(fmtDate('nope', 'ru')).toBe('');
  });
});
