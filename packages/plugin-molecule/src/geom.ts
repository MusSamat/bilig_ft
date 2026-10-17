/**
 * Small geometry helpers for composing parts from the shared shapes: rods as
 * oriented `cylinder` parts (segment count under our control, unlike `tube`),
 * and Euler rotations that align a part's local Y axis with a direction.
 */
import { Euler, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '@bilig/content-model';
import type { Part } from '@bilig/scene-kit';

const UP = new Vector3(0, 1, 0);

/** Euler (XYZ, radians) turning local +Y onto `dir`, then spinning `spin` rad about it. */
export function alignY(dir: Vec3, spin = 0): Vec3 {
  const d = new Vector3(...dir);
  if (d.lengthSq() < 1e-12) return [0, 0, 0];
  const q = new Quaternion().setFromUnitVectors(UP, d.normalize());
  if (spin) q.multiply(new Quaternion().setFromAxisAngle(UP, spin));
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

/** Euler (XYZ) of the rotation whose local X, Y, Z axes map to the given orthonormal vectors. */
export function basisRotation(x: Vec3, y: Vec3, z: Vec3): Vec3 {
  // Rotation matrix columns are the basis vectors; three's Euler.setFromRotationMatrix reads elements.
  const m11 = x[0], m12 = y[0], m13 = z[0];
  const m22 = y[1], m23 = z[1];
  const m32 = y[2], m33 = z[2];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), ry, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), ry, 0];
}

export interface RodOptions {
  radius: number;
  color?: string;
  hue?: number;
  segments?: number;
  /** Radius at `to` (cones, tapers); defaults to `radius`. */
  radiusTo?: number;
  roughness?: number;
  metalness?: number;
  noPick?: boolean;
  concept?: string;
}

/** Cylinder part spanning `from` → `to`. */
export function rod(name: string, parent: string | undefined, from: Vec3, to: Vec3, o: RodOptions): Part {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  return {
    name,
    parent,
    shape: { kind: 'cylinder', radiusTop: o.radiusTo ?? o.radius, radiusBottom: o.radius, height: Math.max(1e-4, length), segments: o.segments ?? 24, openEnded: false },
    position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    rotation: alignY(d),
    color: o.color,
    hue: o.hue,
    roughness: o.roughness,
    metalness: o.metalness,
    noPick: o.noPick,
    concept: o.concept,
  };
}
