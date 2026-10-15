import { describe, it, expect } from 'vitest';
import {
  activityKeys,
  activityProgress,
  emptyProgress,
  markActivity,
  markVisited,
  mergeProgress,
  topicProgress,
} from './index.js';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const topic = animalCellPackage.topic; // 3 concepts

describe('topicProgress (W-11: изучено N из M)', () => {
  it('counts visited topic concepts', () => {
    const p = topicProgress(topic, { visitedConcepts: ['bio.nucleus'], completedActivities: [] });
    expect(p).toEqual({ learned: 1, total: 3, fraction: 1 / 3, percent: 33 });
  });

  it('ignores foreign keys, de-dupes, reports 100% and handles empty topics', () => {
    expect(topicProgress(topic, { visitedConcepts: ['bio.nucleus', 'bio.nucleus', 'x'], completedActivities: [] }).learned).toBe(1);
    expect(topicProgress(topic, { visitedConcepts: [...topic.conceptKeys], completedActivities: [] }).percent).toBe(100);
    expect(topicProgress({ conceptKeys: [] }, emptyProgress())).toEqual({ learned: 0, total: 0, fraction: 0, percent: 0 });
  });
});

describe('activities', () => {
  it('lists the topic activities and their progress', () => {
    expect(activityKeys(topic)).toEqual(['tour', 'process:bio.respiration', 'comparison', 'quiz']);
    expect(activityKeys({ activities: { processKeys: [] } })).toEqual([]);
    expect(activityProgress(topic, { visitedConcepts: [], completedActivities: ['tour', 'quiz', 'other'] }).learned).toBe(2);
  });
});

describe('mergeProgress (offline sync без потерь и дублей)', () => {
  it('unions without duplicates and keeps the latest updatedAt', () => {
    const merged = mergeProgress(
      { visitedConcepts: ['a', 'b'], completedActivities: ['x'], updatedAt: '2026-10-01T10:00:00Z' },
      { visitedConcepts: ['b', 'c'], completedActivities: ['x', 'y'], updatedAt: '2026-10-02T10:00:00Z' },
    );
    expect(merged).toEqual({ visitedConcepts: ['a', 'b', 'c'], completedActivities: ['x', 'y'], updatedAt: '2026-10-02T10:00:00Z' });
    expect(mergeProgress({ ...emptyProgress(), updatedAt: '2026-10-03T00:00:00Z' }, emptyProgress()).updatedAt).toBe('2026-10-03T00:00:00Z');
    expect(mergeProgress(emptyProgress(), emptyProgress())).toEqual(emptyProgress());
  });
});

describe('markVisited / markActivity', () => {
  it('append once and stamp updatedAt', () => {
    const s1 = markVisited(emptyProgress(), 'bio.nucleus', '2026-10-15T00:00:00Z');
    expect(s1).toEqual({ visitedConcepts: ['bio.nucleus'], completedActivities: [], updatedAt: '2026-10-15T00:00:00Z' });
    expect(markVisited(s1, 'bio.nucleus')).toBe(s1);
    const s2 = markActivity(s1, 'tour');
    expect(s2.completedActivities).toEqual(['tour']);
    expect(markActivity(s2, 'tour', 'later')).toBe(s2);
  });
});
