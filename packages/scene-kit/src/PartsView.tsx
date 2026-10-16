/**
 * Renders declarative parts with the shared concept look (W-21 picking, W-22
 * highlight, W-24 ghost/hide, W-25 translucent shells). Every object gets
 * `object.name = part.name` and `userData.conceptKey` from `bindParts`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Object3D, Quaternion, Vector3,
  type Group, type InstancedMesh, type Plane,
} from 'three';
import type { ResolvedConcept, Vec3 } from '@bilig/content-model';
import { CONCEPT_KEY_USERDATA, type ViewerState } from '@bilig/scene-core';
import { lookFor, type ConceptLook } from './look.js';
import { bindParts, type Part, type PartShape } from './parts.js';
import { hoverHandlers, usePick } from './hooks.js';

const UP = new Vector3(0, 1, 0);

function polygonGeometry(points: Vec3[]): BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i + 1 < points.length; i++) pos.push(...points[0], ...points[i], ...points[i + 1]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Position/orientation for shapes defined by two points. */
function spanTransform(from: Vec3, to: Vec3): { position: Vec3; quaternion: Quaternion; length: number } {
  const a = new Vector3(...from);
  const d = new Vector3(...to).sub(a);
  const length = d.length();
  const q = length > 1e-9 ? new Quaternion().setFromUnitVectors(UP, d.clone().normalize()) : new Quaternion();
  const m = a.add(d.multiplyScalar(0.5));
  return { position: [m.x, m.y, m.z], quaternion: q, length };
}

function PolygonGeometry({ points }: { points: Vec3[] }): JSX.Element {
  const geom = useMemo(() => polygonGeometry(points), [points]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <primitive object={geom} attach="geometry" />;
}

function Geometry({ shape }: { shape: PartShape }): JSX.Element | null {
  switch (shape.kind) {
    case 'sphere':
      return <sphereGeometry args={[shape.radius, shape.widthSegments ?? 32, Math.max(8, Math.round((shape.widthSegments ?? 32) * 0.7))]} />;
    case 'box':
      return <boxGeometry args={shape.size} />;
    case 'cylinder':
      return <cylinderGeometry args={[shape.radiusTop, shape.radiusBottom, shape.height, shape.segments ?? 32, 1, shape.openEnded]} />;
    case 'capsule':
      return <capsuleGeometry args={[shape.radius, shape.length, 8, 20]} />;
    case 'torus':
      return <torusGeometry args={[shape.radius, shape.tube, 10, 96, shape.arc ?? Math.PI * 2]} />;
    case 'torusKnot':
      return <torusKnotGeometry args={[shape.radius, shape.tube, 96, 14]} />;
    case 'icosahedron':
      return <icosahedronGeometry args={[shape.radius, shape.detail ?? 1]} />;
    default:
      return null;
  }
}

function Mat({ look, part, clip, container }: { look: ConceptLook; part: Part; clip?: Plane[]; container: boolean }) {
  return (
    <meshPhysicalMaterial
      color={look.color}
      clearcoat={container ? (look.opacity < 0.15 ? 0 : 0.6) : 0.55}
      envMapIntensity={container && look.opacity < 0.15 ? 0.15 : 1}
      clearcoatRoughness={0.3}
      emissive={look.emissive}
      emissiveIntensity={Math.max(look.emissiveIntensity, part.glow ?? 0)}
      transparent={look.transparent}
      opacity={look.opacity}
      depthWrite={look.depthWrite}
      side={container || part.shape.kind === 'polygon' ? DoubleSide : undefined}
      roughness={part.roughness ?? (container ? 0.2 : 0.38)}
      metalness={part.metalness ?? 0.05}
      clippingPlanes={clip}
      polygonOffset={part.shape.kind === 'polygon'}
      polygonOffsetFactor={1}
    />
  );
}

function Instances({ shape, name, userData, look, part, clip }: { shape: Extract<PartShape, { kind: 'instances' }>; name: string; userData: Record<string, unknown>; look: ConceptLook; part: Part; clip?: Plane[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    shape.positions.forEach((p, i) => {
      o.position.set(...p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [shape.positions]);
  if (!shape.positions.length) return null;
  return (
    <instancedMesh key={shape.positions.length} ref={ref} name={name} userData={userData} args={[undefined, undefined, shape.positions.length]} castShadow>
      <sphereGeometry args={[shape.radius, 24, 16]} />
      <Mat look={look} part={part} clip={clip} container={false} />
    </instancedMesh>
  );
}

interface NodeProps {
  part: Part;
  childrenOf: Map<string, Part[]>;
  look: (p: Part) => { look: ConceptLook; container: boolean };
  userData: (p: Part) => Record<string, unknown>;
  clip?: Plane[];
  register: (name: string, obj: Object3D | null) => void;
}

function PartNode({ part, childrenOf, look, userData, clip, register }: NodeProps): JSX.Element | null {
  const { look: lk, container } = look(part);
  const kids = childrenOf.get(part.name) ?? [];
  const ud = userData(part);
  const pointer = ud[CONCEPT_KEY_USERDATA] ? hoverHandlers : {};
  const childNodes = kids.map((k) => (
    <PartNode key={k.name} part={k} childrenOf={childrenOf} look={look} userData={userData} clip={clip} register={register} />
  ));
  const s = part.shape;
  const common = {
    name: part.name,
    userData: ud,
    position: part.position,
    rotation: part.rotation,
    scale: part.scale,
    ref: (o: Object3D | null) => register(part.name, o),
  };
  if (s.kind === 'group') return <group {...common} visible={lk.visible}>{childNodes}</group>;
  if (!lk.visible) return null;
  if (s.kind === 'instances') {
    return (
      <group {...common}>
        <Instances shape={s} name={part.name} userData={ud} look={lk} part={part} clip={clip} />
        {childNodes}
      </group>
    );
  }
  if (s.kind === 'polygon') {
    return (
      <mesh {...common} {...pointer} renderOrder={container ? 2 : 0}>
        <PolygonGeometry points={s.points} />
        <Mat look={lk} part={part} clip={clip} container={container} />
        {childNodes}
      </mesh>
    );
  }
  if (s.kind === 'tube' || s.kind === 'arrow') {
    const to: Vec3 = s.kind === 'tube' ? s.to : [s.from[0] + s.vector[0], s.from[1] + s.vector[1], s.from[2] + s.vector[2]];
    const span = spanTransform(s.from, to);
    const r = s.radius ?? 0.03;
    if (s.kind === 'tube') {
      return (
        <mesh {...common} position={span.position} quaternion={span.quaternion} rotation={undefined} castShadow {...pointer}>
          <cylinderGeometry args={[r, r, span.length, 12]} />
          <Mat look={lk} part={part} clip={clip} container={container} />
          {childNodes}
        </mesh>
      );
    }
    const head = Math.min(span.length * 0.35, r * 6);
    return (
      <group {...common} position={span.position} quaternion={span.quaternion} rotation={undefined}>
        <mesh position={[0, -head / 2, 0]} userData={ud} name={`${part.name}#shaft`} {...pointer}>
          <cylinderGeometry args={[r, r, Math.max(0.001, span.length - head), 12]} />
          <Mat look={lk} part={part} clip={clip} container={container} />
        </mesh>
        <mesh position={[0, span.length / 2 - head / 2, 0]} userData={ud} name={`${part.name}#head`} {...pointer}>
          <coneGeometry args={[r * 2.6, head, 16]} />
          <Mat look={lk} part={part} clip={clip} container={container} />
        </mesh>
        {childNodes}
      </group>
    );
  }
  return (
    <mesh {...common} castShadow={!container} {...pointer} renderOrder={container ? 2 : 0}>
      <Geometry shape={s} />
      <Mat look={lk} part={part} clip={clip} container={container} />
      {childNodes}
    </mesh>
  );
}

export interface PartsViewProps {
  parts: readonly Part[];
  concepts: readonly ResolvedConcept[];
  state: ViewerState;
  onSelectConcept: (key: string | null) => void;
  /** Plugin clock (seconds) for `part.motion`. */
  time?: { current: number };
  clippingPlanes?: Plane[];
  /** Opacity for container parts without their own `opacity`. */
  containerOpacity?: number;
}

/** Shared renderer for declarative parts. */
export function PartsView({ parts, concepts, state, onSelectConcept, time, clippingPlanes, containerOpacity }: PartsViewProps): JSX.Element {
  const binding = useMemo(() => bindParts(parts, concepts), [parts, concepts]);
  const byKey = useMemo(() => new Map(concepts.map((c) => [c.key, c])), [concepts]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Part[]>();
    const names = new Set(parts.map((p) => p.name));
    for (const p of parts) {
      const parent = p.parent && names.has(p.parent) ? p.parent : '';
      m.set(parent, [...(m.get(parent) ?? []), p]);
    }
    return m;
  }, [parts]);
  const onClick = usePick(concepts, onSelectConcept);
  const objects = useRef(new Map<string, Object3D>());
  const moving = useMemo(() => parts.filter((p) => p.motion), [parts]);

  useFrame(() => {
    const t = time?.current ?? 0;
    for (const p of moving) {
      const o = objects.current.get(p.name);
      if (!o) continue;
      const m = p.motion!(t);
      if (m.position) o.position.set(...m.position);
      if (m.rotation) o.rotation.set(...m.rotation);
      if (m.scale) o.scale.set(...m.scale);
      if (m.visible !== undefined) o.visible = m.visible;
    }
  });

  const look = (p: Part) => {
    const key = binding.get(p.name) ?? undefined;
    const c = key ? byKey.get(key) : undefined;
    const container = p.container ?? c?.isContainer ?? false;
    return {
      container,
      look: lookFor(key, state, {
        container,
        hue: c?.hue ?? p.hue,
        baseColor: p.color ?? (c ? undefined : p.hue === undefined ? '#9aa4b2' : undefined),
        containerOpacity: p.opacity ?? containerOpacity,
      }),
    };
  };
  const userData = (p: Part): Record<string, unknown> => {
    const key = p.noPick ? null : binding.get(p.name);
    return key ? { [CONCEPT_KEY_USERDATA]: key } : {};
  };
  const register = (name: string, o: Object3D | null) => {
    if (o) objects.current.set(name, o);
    else objects.current.delete(name);
  };

  return (
    <group onClick={(e: ThreeEvent<MouseEvent>) => onClick(e)}>
      {(childrenOf.get('') ?? []).map((p) => (
        <PartNode key={p.name} part={p} childrenOf={childrenOf} look={look} userData={userData} clip={clippingPlanes} register={register} />
      ))}
    </group>
  );
}

/** Type guard used by plugins that keep refs to groups. */
export type PartsGroup = Group;
