import { describe, expect, it } from 'vitest';
import { AA_LARGE, AA_NORMAL, contrastChecks, contrastRatio, tokensFromHue } from './hue';
import { csvRecords, parseCsv, toCsv } from './csv';
import { diffJson } from './diff';
import { parseObjectivesCsv } from '../modules/Programme';
import { composeReason, docPaths } from '../modules/Review';
import { cellValue, setManual } from '../modules/topics/ComparisonEditor';
import { moveItem } from '../modules/topics/TourEditor';
import { localToIso } from '../modules/Publishing';
import { periodQuery } from '../modules/Analytics';
import { kindOf, nodeTree } from '../modules/Assets';

describe('hue → tokens + WCAG contrast (A-02)', () => {
  it('black/white is 21:1', () => {
    expect(contrastRatio({ h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 100 })).toBeCloseTo(21, 5);
  });
  it('every hue 0–359 passes AA in both themes', () => {
    for (let h = 0; h < 360; h++) {
      for (const theme of ['light', 'dark'] as const) {
        const failed = contrastChecks(tokensFromHue(h, theme)).filter((c) => !c.pass);
        expect(failed, `hue ${h} ${theme}`).toEqual([]);
      }
    }
  });
  it('reports the required ratio per pair', () => {
    const checks = contrastChecks(tokensFromHue(140, 'light'));
    expect(checks.find((c) => c.pair === 'text')!.required).toBe(AA_NORMAL);
    expect(checks.find((c) => c.pair === 'focus')!.required).toBe(AA_LARGE);
  });
});

describe('csv', () => {
  it('parses quotes, escaped quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });
  it('round-trips', () => {
    const rows = [['k', 'v,1', 'a"b']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('maps header rows to records', () => {
    expect(csvRecords('Code,Key\nBIO-1,bio.a')).toEqual([{ line: 2, rec: { code: 'BIO-1', key: 'bio.a' } }]);
  });
  it('objectives CSV is validated with ObjectiveSchema', () => {
    const rows = parseObjectivesCsv('code,key,unitKey,ky,ru,en\nBIO-7.1.1,bio.obj-1,bio.g7.cells,Клетка,Клетка,Cell\n,BAD KEY,u,,,\n');
    expect(rows[0].value).toEqual({ code: 'BIO-7.1.1', key: 'bio.obj-1', unitKey: 'bio.g7.cells', text: { ky: 'Клетка', ru: 'Клетка', en: 'Cell' } });
    expect(rows[1].value).toBeUndefined();
    expect(rows[1].errors.length).toBeGreaterThan(0);
  });
});

describe('diff', () => {
  it('lists added / removed / changed paths', () => {
    expect(diffJson({ a: 1, b: [1, 2], c: { d: 'x' } }, { a: 2, b: [1], c: { d: 'x', e: true } })).toEqual([
      { path: ['a'], kind: 'changed', before: 1, after: 2 },
      { path: ['b', 1], kind: 'removed', before: 2 },
      { path: ['c', 'e'], kind: 'added', after: true },
    ]);
  });
});

describe('A-07 tour reorder', () => {
  it('moves an item', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('A-09 comparison', () => {
  const concept = { key: 'c', kind: 'k', hue: 1, isContainer: false, title: { ky: '', ru: 'c', en: '' }, description: { ky: '', ru: '', en: '' }, props: [{ kind: 'quantity' as const, type: 'size', value: 10 }], related: [], misconceptions: [], examples: { stem: [], simple: [] } };
  it('pulls dictionary values, null where the property is missing', () => {
    expect(cellValue(concept, 'size', 'ru')).toBe('10 µm');
    expect(cellValue(concept, 'mass', 'ru')).toBeNull();
  });
  it('manual cells are added, replaced and removed', () => {
    let cmp = setManual({ columns: [], rows: [] }, 'c', 'mass', { ky: '', ru: '1 кг', en: '' });
    cmp = setManual(cmp, 'c', 'mass', { ky: '', ru: '2 кг', en: '' });
    expect(cmp.manual).toEqual([{ column: 'c', row: 'mass', value: { ky: '', ru: '2 кг', en: '' } }]);
    expect(setManual(cmp, 'c', 'mass', undefined).manual).toBeUndefined();
  });
});

describe('A-13 / A-14 / A-17 / A-05 helpers', () => {
  it('datetime-local → ISO with offset', () => {
    expect(localToIso('')).toBeUndefined();
    expect(localToIso('2026-11-01T09:00')).toMatch(/^2026-1[01]-\d\dT\d\d:00:00\.000Z$/);
  });
  it('reject reason carries the review comments, capped at 2000 chars', () => {
    const c = { id: '1', authorId: 'u1', targetType: 'topic' as const, targetId: 't', path: 'title.ky', body: 'Опечатка', createdAt: '' };
    expect(composeReason('Доработать', [c, { ...c, path: 'scene', anchor3d: [1, 2, 3] as [number, number, number], body: 'Метка' }])).toBe('Доработать\n\n• title.ky: Опечатка\n• scene @(1.00, 2.00, 3.00): Метка');
    expect(composeReason('x'.repeat(3000), []).length).toBe(2000);
  });
  it('doc paths stop at localized values', () => {
    expect(docPaths({ title: { ky: '', ru: '', en: '' }, scene: { modes: ['a'] } })).toEqual(['title', 'scene.modes.0']);
  });
  it('analytics period → contract date-times (to is exclusive next day)', () => {
    expect(periodQuery('2026-10-01', '2026-10-15')).toEqual({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-16T00:00:00.000Z' });
    expect(periodQuery('bad', null)).toEqual({});
  });
  it('asset kind and node tree', () => {
    expect(kindOf('Cell.GLB')).toBe('glb');
    expect(kindOf('x.mol')).toBe('molfile');
    expect(kindOf('x.png')).toBe('image');
    const tree = nodeTree(['Cell/Nucleus', 'Cell/Mito_1', 'Root']);
    expect([...tree.keys()]).toEqual(['Cell', 'Root']);
    expect([...(tree.get('Cell') as Map<string, unknown>).keys()]).toEqual(['Nucleus', 'Mito_1']);
  });
});
