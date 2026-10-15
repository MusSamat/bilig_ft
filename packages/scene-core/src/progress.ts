/**
 * Progress accounting (TZ W-11: "Прогресс" — изучено N из M, полоса).
 *
 * Progress is "visited concepts out of all concepts". For signed-in users it
 * lives on the server; for guests in IndexedDB — but the math is the same and
 * lives here so both paths agree.
 */
import type { Topic } from '@bilig/content-model';

export interface ProgressState {
  visitedConceptIds: string[];
  completedActivityIds: string[];
}

export interface ProgressSummary {
  learned: number;
  total: number;
  /** 0..1 fraction for the progress bar. */
  fraction: number;
  percent: number;
}

/** "Изучено N из M" for a topic given the user's visited concepts (TZ W-11). */
export function topicProgress(
  topic: Topic,
  state: ProgressState,
): ProgressSummary {
  const total = topic.concepts.length;
  const ids = new Set(topic.concepts.map((c) => c.id));
  const learned = new Set(
    state.visitedConceptIds.filter((id) => ids.has(id)),
  ).size;
  const fraction = total === 0 ? 0 : learned / total;
  return {
    learned,
    total,
    fraction,
    percent: Math.round(fraction * 100),
  };
}

/** Merge two progress states (offline-sync union, TZ §6 "без потерь и дублей"). */
export function mergeProgress(
  a: ProgressState,
  b: ProgressState,
): ProgressState {
  return {
    visitedConceptIds: [
      ...new Set([...a.visitedConceptIds, ...b.visitedConceptIds]),
    ],
    completedActivityIds: [
      ...new Set([...a.completedActivityIds, ...b.completedActivityIds]),
    ],
  };
}
