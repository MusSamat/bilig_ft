/** Shared picking & pointer helpers (TZ W-21: shells never steal clicks). */
import { pickConcept, CONCEPT_KEY_USERDATA, type Hit, type PickableConcept } from '@bilig/scene-core';

/** Minimal intersection shape (three.js Intersection-compatible). */
export interface IntersectionLike {
  distance: number;
  object: ObjectLike;
}
export interface ObjectLike {
  userData: Record<string, unknown>;
  parent: ObjectLike | null;
}

/** userData tagging a mesh with its concept (engine convention). */
export const conceptUserData = (key: string | undefined | null): Record<string, unknown> =>
  key ? { [CONCEPT_KEY_USERDATA]: key } : {};

/** Concept key of an object or its nearest tagged ancestor. */
export function conceptKeyOf(obj: ObjectLike | null): string | null {
  for (let o = obj; o; o = o.parent) {
    const k = o.userData?.[CONCEPT_KEY_USERDATA];
    if (typeof k === 'string' && k) return k;
  }
  return null;
}

/** Hits from raycast intersections (untagged objects dropped). */
export function hitsFrom(intersections: readonly IntersectionLike[]): Hit[] {
  const out: Hit[] = [];
  for (const i of intersections) {
    const k = conceptKeyOf(i.object);
    if (k) out.push({ conceptKey: k, distance: i.distance });
  }
  return out;
}

/** Resolve a click: nearest non-container concept wins, else nearest container. */
export const resolvePick = (intersections: readonly IntersectionLike[], concepts: readonly PickableConcept[]) =>
  pickConcept(hitsFrom(intersections), concepts);
