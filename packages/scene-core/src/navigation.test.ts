import { describe, it, expect } from 'vitest';
import { buildTree, breadcrumbs, topicsUnder } from './navigation.js';
import type { CourseNode } from '@bilig/content-model';

const L = (s: string) => ({ ky: s, ru: s, en: s });

// subject(bio) → unit(cells) → topic(animal-cell), + a sibling unit.
const nodes: CourseNode[] = [
  { id: 'bio', parentId: null, subjectId: 'bio', slug: 'bio', title: L('Биология'), order: 0 },
  { id: 'cells', parentId: 'bio', subjectId: 'bio', slug: 'cells', title: L('Клетки'), order: 1 },
  { id: 'genetics', parentId: 'bio', subjectId: 'bio', slug: 'genetics', title: L('Генетика'), order: 0 },
  {
    id: 'animal-cell',
    parentId: 'cells',
    subjectId: 'bio',
    slug: 'animal-cell',
    title: L('Животная клетка'),
    order: 0,
    topicId: 'topic-animal-cell',
  },
  {
    id: 'plant-cell',
    parentId: 'cells',
    subjectId: 'bio',
    slug: 'plant-cell',
    title: L('Растительная клетка'),
    order: 1,
    topicId: 'topic-plant-cell',
  },
];

describe('buildTree (TZ W-04: hierarchy of any depth from data)', () => {
  it('nests children and sorts siblings by order', () => {
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('bio');
    // genetics(order 0) comes before cells(order 1)
    expect(tree[0].children.map((c) => c.id)).toEqual(['genetics', 'cells']);
    expect(
      tree[0].children.find((c) => c.id === 'cells')!.children.map((c) => c.id),
    ).toEqual(['animal-cell', 'plant-cell']);
  });
});

describe('breadcrumbs (TZ W-04: предмет → раздел → тема)', () => {
  it('returns the full path from subject to the topic node', () => {
    const path = breadcrumbs(nodes, 'animal-cell').map((n) => n.id);
    expect(path).toEqual(['bio', 'cells', 'animal-cell']);
  });

  it('returns [] for an unknown node', () => {
    expect(breadcrumbs(nodes, 'nope')).toEqual([]);
  });

  it('does not loop forever on a cyclic parent chain', () => {
    const cyclic: CourseNode[] = [
      { id: 'a', parentId: 'b', subjectId: 's', slug: 'a', title: L('A'), order: 0 },
      { id: 'b', parentId: 'a', subjectId: 's', slug: 'b', title: L('B'), order: 0 },
    ];
    const path = breadcrumbs(cyclic, 'a');
    expect(path.length).toBeLessThanOrEqual(2);
  });
});

describe('topicsUnder', () => {
  it('collects all leaf topics in tree order', () => {
    expect(topicsUnder(nodes, 'bio').map((n) => n.id)).toEqual([
      'animal-cell',
      'plant-cell',
    ]);
    expect(topicsUnder(nodes, 'genetics')).toEqual([]);
  });
});
