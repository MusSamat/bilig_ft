import { describe, expect, it } from 'vitest';
import { validatePackage } from '@bilig/content-model';
import { PACKAGES, buildCatalog } from './data';

describe('mock content (snapshot of bilig_back/content)', () => {
  it('loads every package and they validate', () => {
    expect(PACKAGES.length).toBeGreaterThanOrEqual(20);
    for (const p of PACKAGES) expect(validatePackage(p).ok, p.topic.key).toBe(true);
  });
  it('builds a valid catalog with several subjects and a locked one', () => {
    const c = buildCatalog();
    expect(new Set(c.topics.map((t) => t.subjectKey)).size).toBeGreaterThanOrEqual(5);
    expect(c.subjects.some((s) => s.status === 'soon')).toBe(true);
  });
});
