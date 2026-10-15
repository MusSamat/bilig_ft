import { describe, it, expect } from 'vitest';
import { topicProgress, mergeProgress } from './progress.js';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const topic = animalCellPackage.topics[0]; // 3 concepts

describe('topicProgress (TZ W-11: изучено N из M)', () => {
  it('counts visited concepts out of the topic total', () => {
    const p = topicProgress(topic, {
      visitedConceptIds: ['bio.nucleus'],
      completedActivityIds: [],
    });
    expect(p.learned).toBe(1);
    expect(p.total).toBe(3);
    expect(p.percent).toBe(33);
    expect(p.fraction).toBeCloseTo(1 / 3, 5);
  });

  it('ignores visited ids that are not in this topic, and de-dupes', () => {
    const p = topicProgress(topic, {
      visitedConceptIds: ['bio.nucleus', 'bio.nucleus', 'other.topic.concept'],
      completedActivityIds: [],
    });
    expect(p.learned).toBe(1);
  });

  it('reports 100% when all concepts are visited', () => {
    const p = topicProgress(topic, {
      visitedConceptIds: topic.concepts.map((c) => c.id),
      completedActivityIds: [],
    });
    expect(p.percent).toBe(100);
    expect(p.fraction).toBe(1);
  });
});

describe('mergeProgress (TZ §6: offline sync без потерь и дублей)', () => {
  it('unions visited concepts and activities without duplicates', () => {
    const merged = mergeProgress(
      { visitedConceptIds: ['a', 'b'], completedActivityIds: ['x'] },
      { visitedConceptIds: ['b', 'c'], completedActivityIds: ['x', 'y'] },
    );
    expect(merged.visitedConceptIds.sort()).toEqual(['a', 'b', 'c']);
    expect(merged.completedActivityIds.sort()).toEqual(['x', 'y']);
  });
});
