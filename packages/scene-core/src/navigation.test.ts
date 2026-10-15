import { describe, it, expect } from 'vitest';
import { breadcrumbs, groupedSubjects, subjectTree } from './index.js';
import type { Catalog } from '@bilig/content-model';
import { animalCellCatalog } from '@bilig/content-model/fixtures/animal-cell';

describe('breadcrumbs (W-04: предмет → раздел → тема)', () => {
  it('returns subject → course → unit → topic', () => {
    expect(breadcrumbs(animalCellCatalog, 'animal-cell').map((c) => `${c.kind}:${c.key}`)).toEqual([
      'subject:bio', 'course:bio.g7', 'unit:bio.g7.cells', 'topic:animal-cell',
    ]);
  });

  it('skips missing levels; unknown topic → []', () => {
    const c: Catalog = { ...animalCellCatalog, units: [] };
    expect(breadcrumbs(c, 'animal-cell').map((x) => x.kind)).toEqual(['subject', 'topic']);
    expect(breadcrumbs(animalCellCatalog, 'nope')).toEqual([]);
  });
});

describe('subjectTree & groupedSubjects', () => {
  it('nests courses → units → topics', () => {
    const tree = subjectTree(animalCellCatalog, 'bio')!;
    expect(tree.subject.key).toBe('bio');
    expect(tree.courses[0].units[0].topics.map((t) => t.key)).toEqual(['animal-cell']);
    expect(subjectTree(animalCellCatalog, 'nope')).toBeNull();
    expect(subjectTree(animalCellCatalog, 'chem')!.courses).toEqual([]);
  });

  it('groups subjects by data-driven groups, dropping empty groups', () => {
    const g = groupedSubjects(animalCellCatalog);
    expect(g.map((x) => x.groupKey)).toEqual(['natural']);
    expect(g[0].subjects.map((s) => s.key)).toEqual(['bio', 'chem']);
  });
});
