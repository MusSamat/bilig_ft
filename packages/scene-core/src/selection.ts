/**
 * Selection, anchors, colors and visibility (TZ W-21, W-22, W-24, W-31).
 * Shells are recognized by the concept's `isContainer` flag — never by an id list in code.
 */
import type { ConceptOverride, Topic, Vec3 } from '@bilig/content-model';

/** Minimal concept shape the picker needs (Concept and ResolvedConcept both fit). */
export interface PickableConcept {
  key: string;
  isContainer: boolean;
}

/** A ray hit (smaller distance = closer to the camera). */
export interface Hit {
  conceptKey: string;
  distance: number;
}

/**
 * Resolve which concept a click selects (W-21): if any non-container concept
 * was hit, the nearest of those wins; otherwise the nearest known container;
 * hits on unknown keys are ignored.
 */
export function pickConcept(hits: readonly Hit[], concepts: readonly PickableConcept[]): string | null {
  const byKey = new Map(concepts.map((c) => [c.key, c]));
  const known = [...hits].filter((h) => byKey.has(h.conceptKey)).sort((a, b) => a.distance - b.distance);
  if (known.length === 0) return null;
  const solid = known.find((h) => !byKey.get(h.conceptKey)!.isContainer);
  return (solid ?? known[0]).conceptKey;
}

/** Select by key: returns the key when it exists among the concepts, else null (for ?focus=). */
export function selectByKey(concepts: readonly PickableConcept[], key: string | null | undefined): string | null {
  return key && concepts.some((c) => c.key === key) ? key : null;
}

/**
 * Label/camera anchor for a concept (W-22): the topic override anchor wins,
 * else `fallback` (the engine passes the first instance's center), else undefined.
 */
export function anchorFor(
  conceptKey: string,
  overrides: Topic['overrides'] | undefined,
  fallback?: Vec3,
): Vec3 | undefined {
  return overrides?.[conceptKey]?.anchor ?? fallback;
}

/** Accent hue (W-31 color dot): topic override > concept hue. */
export function hueFor(concept: { hue: number }, override?: Pick<ConceptOverride, 'hue'>): number {
  return override?.hue ?? concept.hue;
}

export type ConceptVisibility = 'normal' | 'ghost' | 'hidden';

/**
 * Per-concept visibility for a tour step or toolbar command (W-24, W-50):
 * `isolate` → those stay normal, others are ghosted (translucent);
 * `hide` → hidden. Hide wins over isolate.
 */
export function conceptVisibility(
  conceptKeys: readonly string[],
  visibility?: { isolate?: readonly string[]; hide?: readonly string[] },
): Record<string, ConceptVisibility> {
  const isolate = visibility?.isolate?.length ? new Set(visibility.isolate) : null;
  const hide = new Set(visibility?.hide ?? []);
  const out: Record<string, ConceptVisibility> = {};
  for (const k of conceptKeys) {
    out[k] = hide.has(k) ? 'hidden' : isolate && !isolate.has(k) ? 'ghost' : 'normal';
  }
  return out;
}

/** Toolbar «Выделить» (others translucent) for the selected concept. */
export const isolateSelected = (conceptKeys: readonly string[], selected: string) =>
  conceptVisibility(conceptKeys, { isolate: [selected] });

/** Toolbar «Скрыть остальное» for the selected concept. */
export const hideOthers = (conceptKeys: readonly string[], selected: string) =>
  conceptVisibility(conceptKeys, { hide: conceptKeys.filter((k) => k !== selected) });
