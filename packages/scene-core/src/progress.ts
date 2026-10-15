/**
 * Progress accounting (TZ W-11 «изучено N из M», §8 Progress). Server for
 * signed-in users, IndexedDB for guests — the math is shared here.
 */
import type { Topic } from '@bilig/content-model';

export interface ProgressState {
  visitedConcepts: string[];
  completedActivities: string[];
  updatedAt?: string;
}

export interface ProgressSummary {
  learned: number;
  total: number;
  /** 0..1 for the progress bar. */
  fraction: number;
  percent: number;
}

export const emptyProgress = (): ProgressState => ({ visitedConcepts: [], completedActivities: [] });

/** «Изучено N из M»: visited concepts of this topic (unknown keys ignored, de-duplicated). */
export function topicProgress(topic: Pick<Topic, 'conceptKeys'>, state: ProgressState): ProgressSummary {
  const keys = new Set(topic.conceptKeys);
  const total = keys.size;
  const learned = new Set(state.visitedConcepts.filter((k) => keys.has(k))).size;
  const fraction = total === 0 ? 0 : learned / total;
  return { learned, total, fraction, percent: Math.round(fraction * 100) };
}

/** Activity keys a topic offers: `tour`, `process:<key>`…, `comparison`, `quiz`. */
export function activityKeys(topic: Pick<Topic, 'activities'>): string[] {
  const a = topic.activities;
  return [
    ...(a.tour ? ['tour'] : []),
    ...a.processKeys.map((k) => `process:${k}`),
    ...(a.comparison ? ['comparison'] : []),
    ...(a.quiz ? ['quiz'] : []),
  ];
}

/** Activities progress (completed of offered). */
export function activityProgress(topic: Pick<Topic, 'activities'>, state: ProgressState): ProgressSummary {
  const keys = activityKeys(topic);
  return topicProgress({ conceptKeys: keys }, { ...state, visitedConcepts: state.completedActivities });
}

const later = (a?: string, b?: string): string | undefined =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

/** Offline-sync merge: union without duplicates, latest updatedAt (TZ §6 «без потерь и дублей»). */
export function mergeProgress(a: ProgressState, b: ProgressState): ProgressState {
  const updatedAt = later(a.updatedAt, b.updatedAt);
  return {
    visitedConcepts: [...new Set([...a.visitedConcepts, ...b.visitedConcepts])],
    completedActivities: [...new Set([...a.completedActivities, ...b.completedActivities])],
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/** Record a visited concept (no-op when already visited). */
export function markVisited(state: ProgressState, conceptKey: string, now?: string): ProgressState {
  if (state.visitedConcepts.includes(conceptKey)) return state;
  return { ...state, visitedConcepts: [...state.visitedConcepts, conceptKey], ...(now ? { updatedAt: now } : {}) };
}

/** Record a completed activity (no-op when already completed). */
export function markActivity(state: ProgressState, activityKey: string, now?: string): ProgressState {
  if (state.completedActivities.includes(activityKey)) return state;
  return {
    ...state,
    completedActivities: [...state.completedActivities, activityKey],
    ...(now ? { updatedAt: now } : {}),
  };
}
