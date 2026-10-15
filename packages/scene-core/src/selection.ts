/**
 * Selection / picking logic (TZ W-21).
 *
 * "Выбор структуры кликом по модели... оболочки (мембрана, стенка, грани) не
 * перехватывают клик у внутренних структур." The engine knows which concepts
 * are shells via the `container` flag, not via a hard-coded id list in code.
 */
import type { Concept } from '@bilig/content-model';

/** A ray hit, nearest first (smaller distance = closer to the camera). */
export interface Hit {
  conceptId: string;
  distance: number;
}

/**
 * Resolve which concept a click selects. Container shells never steal the click
 * from a non-container structure they enclose: if any non-container concept was
 * hit, the nearest of those wins; otherwise the nearest container wins.
 */
export function pickConcept(hits: Hit[], concepts: Concept[]): string | null {
  if (hits.length === 0) return null;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const sorted = [...hits].sort((a, b) => a.distance - b.distance);

  const firstSolid = sorted.find((h) => byId.get(h.conceptId)?.container === false);
  if (firstSolid) return firstSolid.conceptId;

  // Only shells were hit (or hits reference unknown concepts) — take the nearest.
  return sorted[0].conceptId;
}

/**
 * Effective anchor for a concept's label/camera (TZ W-22): a scene override wins,
 * else the concept's own anchor, else none (caller uses first instance).
 */
export function anchorFor(
  concept: Concept,
  override?: { anchor?: [number, number, number] },
): [number, number, number] | undefined {
  return override?.anchor ?? concept.anchor;
}

/**
 * Effective accent hue for a concept (TZ W-31 color dot): override > own > fallback.
 */
export function hueFor(
  concept: Concept,
  fallback: number,
  override?: { colorHue?: number },
): number {
  return override?.colorHue ?? concept.colorHue ?? fallback;
}
