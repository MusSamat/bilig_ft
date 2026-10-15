/**
 * Declarative scene parts (TZ W-21/W-22, content convention «nodes are named
 * by part»). Generator plugins describe their scene as a flat list of NAMED
 * parts; concepts bind to parts by node name through the topic's
 * `overrides[key].nodes` globs (`Atom_H*`, `Ion_Na_*`, `cube_Edge_*`), exactly
 * like GLB nodes. This module is pure so naming and binding are unit-tested.
 */
import { conceptForNode, type ResolvedConcept, type Vec3 } from '@bilig/content-model';

export type PartShape =
  | { kind: 'group' }
  | { kind: 'sphere'; radius: number; widthSegments?: number }
  | { kind: 'box'; size: Vec3 }
  | { kind: 'cylinder'; radiusTop: number; radiusBottom: number; height: number; segments?: number; openEnded?: boolean }
  | { kind: 'capsule'; radius: number; length: number }
  | { kind: 'torus'; radius: number; tube: number; arc?: number }
  | { kind: 'torusKnot'; radius: number; tube: number }
  | { kind: 'icosahedron'; radius: number; detail?: number }
  /** Cylinder spanning two points (bonds, edges, wires, rods). */
  | { kind: 'tube'; from: Vec3; to: Vec3; radius: number }
  /** Arrow from a point along a vector (forces, velocity). */
  | { kind: 'arrow'; from: Vec3; vector: Vec3; radius?: number }
  /** Flat convex polygon (faces), fan-triangulated, double sided. */
  | { kind: 'polygon'; points: Vec3[] }
  /** Instanced spheres (crystal ions). */
  | { kind: 'instances'; positions: Vec3[]; radius: number };

export interface Part {
  /** Node name (`Atom_O1`, `cube_Edge_3`, `Bob`). Unique within a scene. */
  name: string;
  shape: PartShape;
  /** Name of the parent group part; binding falls back to parent names. */
  parent?: string;
  position?: Vec3;
  /** Euler rotation, radians. */
  rotation?: Vec3;
  scale?: Vec3;
  /** Fixed colour (CPK atoms, wires); otherwise the bound concept's hue. */
  color?: string;
  /** Hue used when unbound and no colour is given. */
  hue?: number;
  /** Translucent, non-click-stealing shell; defaults to the bound concept's flag. */
  container?: boolean;
  /** Opacity for containers / translucent parts. */
  opacity?: number;
  /** Self-illumination (sun, lamp glow, electrons). */
  glow?: number;
  /** Explicit concept key from params; used only when no node mask matches. */
  concept?: string;
  /** Excluded from picking (decorations, orbit guides). */
  noPick?: boolean;
  /** Per-frame motion; `t` is the plugin clock in seconds. */
  motion?: (t: number) => { position?: Vec3; rotation?: Vec3; scale?: Vec3; visible?: boolean };
  metalness?: number;
  roughness?: number;
}

/**
 * Concept key for every part: own name via `conceptForNode` (overrides' node
 * globs), else the nearest ancestor group's binding, else `part.concept`
 * when that concept is in the topic.
 */
export function bindParts(parts: readonly Part[], concepts: readonly ResolvedConcept[]): Map<string, string | null> {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const known = new Set(concepts.map((c) => c.key));
  const out = new Map<string, string | null>();
  const resolve = (p: Part, depth = 0): string | null => {
    if (out.has(p.name)) return out.get(p.name)!;
    let key = conceptForNode(p.name, concepts);
    if (!key && p.concept && known.has(p.concept)) key = p.concept;
    if (!key && p.parent && depth < 32) {
      const parent = byName.get(p.parent);
      if (parent) key = resolve(parent, depth + 1);
    }
    out.set(p.name, key);
    return key;
  };
  for (const p of parts) resolve(p);
  return out;
}

/** Concepts (with node masks) that no part binds — used by tests and dev warnings. */
export function unboundConcepts(parts: readonly Part[], concepts: readonly ResolvedConcept[]): string[] {
  const bound = new Set([...bindParts(parts, concepts).values()].filter(Boolean));
  return concepts.filter((c) => c.nodes?.length && !bound.has(c.key)).map((c) => c.key);
}

/** Expand a node mask into concrete names (`Mito_*` → `Mito_1…n`, `Golgi*` → `Golgi1…n`). */
export function namesForMask(mask: string, count: number): string[] {
  if (!/[*?]/.test(mask)) return [mask];
  return Array.from({ length: count }, (_, i) => mask.replace(/\*/g, String(i + 1)).replace(/\?/g, String((i + 1) % 10)));
}

/** Concept-to-vector helpers for builders. */
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const mid3 = (a: Vec3, b: Vec3): Vec3 => scale3(add(a, b), 0.5);
