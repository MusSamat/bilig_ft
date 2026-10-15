/**
 * Procedural stand-in for a GLB scene (TZ W-25), used while a topic has no
 * GLB yet or its asset fails to load. Every object is named after the concept's
 * node masks from `overrides[key].nodes` (`Mito_*` → `Mito_1…3`, `Nucleus`),
 * so the same binding as a real GLB applies. Pure, so it is unit-tested.
 */
import type { ResolvedConcept, Vec3 } from '@bilig/content-model';
import { namesForMask, type Part } from '@bilig/scene-kit';

export type BlobShape = 'sphere' | 'capsule' | 'ellipsoid' | 'torusKnot' | 'torus' | 'icosa';
export const BLOB_SHAPES: readonly BlobShape[] = ['sphere', 'capsule', 'ellipsoid', 'torusKnot', 'torus', 'icosa'];

export const OUTER_SHELL_RADIUS = 2.4;
const SHELL_STEP = 0.32;
const RING_RADIUS = 1.45;
/** Instances generated for a glob mask (`Mito_*`). */
export const GLOB_INSTANCES = 3;

/** Small deterministic hash → [0,1). */
function unit(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

type LayoutConcept = Pick<ResolvedConcept, 'key' | 'isContainer' | 'anchor' | 'nodes' | 'hue'>;

/** Node names for a concept: its first literal mask, or instances of its first glob mask. */
export function nodeNamesFor(c: LayoutConcept): string[] {
  const masks = c.nodes?.length ? c.nodes : [`Concept_${c.key.replace(/[^A-Za-z0-9]+/g, '_')}`];
  const literal = masks.find((m) => !/[*?]/.test(m));
  return literal ? [literal] : namesForMask(masks[0], GLOB_INSTANCES);
}

function blobShape(shape: BlobShape, size: number): Part['shape'] {
  switch (shape) {
    case 'capsule':
      return { kind: 'capsule', radius: size * 0.45, length: size * 1.1 };
    case 'torusKnot':
      return { kind: 'torusKnot', radius: size * 0.6, tube: size * 0.2 };
    case 'torus':
      return { kind: 'torus', radius: size * 0.7, tube: size * 0.28 };
    case 'icosa':
      return { kind: 'icosahedron', radius: size, detail: 1 };
    default:
      return { kind: 'sphere', radius: size, widthSegments: 40 };
  }
}

/**
 * Containers → nested translucent shells (outermost first); other concepts →
 * blobs at their anchor (first instance) or on a golden-angle spiral; extra
 * glob instances are scattered deterministically around the first one.
 */
export function proceduralParts(concepts: readonly LayoutConcept[]): Part[] {
  const parts: Part[] = [];
  let shell = 0;
  for (const c of concepts) {
    if (!c.isContainer) continue;
    const [name] = nodeNamesFor(c);
    parts.push({
      name,
      shape: { kind: 'sphere', radius: Math.max(0.8, OUTER_SHELL_RADIUS - shell * SHELL_STEP), widthSegments: 64 },
      position: [0, 0, 0],
      container: true,
      concept: c.key,
      roughness: 0.2,
    });
    shell++;
  }
  const inner = concepts.filter((c) => !c.isContainer);
  const n = inner.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const limit = Math.max(0.8, OUTER_SHELL_RADIUS - shell * SHELL_STEP) - 0.35;
  inner.forEach((c, i) => {
    const shape = BLOB_SHAPES[i % BLOB_SHAPES.length];
    let base: Vec3;
    if (c.anchor) base = c.anchor;
    else if (n === 1) base = [0, 0, 0];
    else {
      const y = 1 - ((i + 0.5) / n) * 2;
      const r = Math.sqrt(1 - y * y);
      base = [Math.cos(golden * i) * r * RING_RADIUS, y * RING_RADIUS * 0.6, Math.sin(golden * i) * r * RING_RADIUS];
    }
    const names = nodeNamesFor(c);
    const size = (names.length > 1 ? 0.2 : 0.34) + unit(c.key, 1) * 0.12;
    names.forEach((name, k) => {
      let pos = base;
      if (k > 0) {
        const a = unit(c.key, 10 + k) * Math.PI * 2;
        const off: Vec3 = [Math.cos(a) * 0.55, (unit(c.key, 20 + k) - 0.5) * 0.6, Math.sin(a) * 0.55];
        pos = [base[0] + off[0], base[1] + off[1], base[2] + off[2]];
        const d = Math.hypot(...pos);
        if (d > limit) pos = pos.map((v) => (v / d) * limit) as Vec3;
      }
      parts.push({
        name,
        shape: blobShape(shape, size),
        position: pos,
        rotation: [unit(name, 2) * Math.PI, unit(name, 3) * Math.PI, unit(name, 4) * Math.PI],
        scale: shape === 'ellipsoid' ? [1.4, 0.8, 1] : undefined,
        concept: c.key,
      });
    });
  });
  return parts;
}
