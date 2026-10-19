/**
 * Renders declarative parts with the shared concept look (W-21 picking, W-22
 * highlight, W-24 ghost/hide, W-25 translucent shells). Every object gets
 * `object.name = part.name` and `userData.conceptKey` from `bindParts`.
 *
 * Optional part capabilities (parts.ts): surface presets (`material`),
 * procedural textures (`texture`), a Sun-driven day/night terminator
 * (`sunlit`), atmosphere rims, glow sprites (`halo`) and crisp `edges`.
 * Geometries are shared between parts with the same shape; textures are
 * built once per session (textures.ts). Decorations (sprites, edge lines)
 * are not meshes, so they never take clicks, outlines or shadows.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, BoxGeometry, CapsuleGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide,
  EdgesGeometry, Float32BufferAttribute, FrontSide, IcosahedronGeometry, LatheGeometry, Object3D, Quaternion, RingGeometry,
  SphereGeometry, TorusGeometry, TorusKnotGeometry, TubeGeometry, Vector2, Vector3,
  type Group, type InstancedMesh, type Material, type Plane, type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ResolvedConcept, Vec3 } from '@bilig/content-model';
import { CONCEPT_KEY_USERDATA, type ViewerState } from '@bilig/scene-core';
import { FOCUS_RENDER_ORDER, lookFor, type ConceptLook } from './look.js';
import { bindParts, type Part, type PartMaterial, type PartShape } from './parts.js';
import { hoverHandlers, usePick } from './hooks.js';
import { setSaturation } from './saturation.js';
import { TextPart } from './TextPart.js';
import { bumpTexture, partTexture, RIM_SPRITE_SCALE } from './textures.js';

const UP = new Vector3(0, 1, 0);
const noRaycast = () => {};

// ---------------------------------------------------------------------------
// Geometry: built once per distinct shape and shared (reference counted).
// ---------------------------------------------------------------------------

function polygonGeometry(points: Vec3[], uvScale: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  // Planar UVs in scene units (grids and wood grain keep their size on every face),
  // along the first edge so square grids line up with the polygon's sides.
  const p0 = new Vector3(...points[0]);
  const e1 = new Vector3(...(points[1] ?? points[0])).sub(p0).normalize();
  const n = new Vector3();
  for (let i = 1; i + 1 < points.length; i++) {
    const a = new Vector3(...points[i]).sub(p0);
    const b = new Vector3(...points[i + 1]).sub(p0);
    n.add(a.cross(b));
  }
  n.normalize();
  const e2 = n.clone().cross(e1).normalize();
  const uvOf = (p: Vec3) => {
    const d = new Vector3(...p).sub(p0);
    return [d.dot(e1) * uvScale, d.dot(e2) * uvScale];
  };
  for (let i = 1; i + 1 < points.length; i++) {
    for (const p of [points[0], points[i], points[i + 1]]) {
      pos.push(...p);
      uv.push(...uvOf(p));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function ringGeometry(inner: number, outer: number, segments: number): BufferGeometry {
  const g = new RingGeometry(inner, outer, segments, 1);
  g.rotateX(-Math.PI / 2);
  // u runs from the inner to the outer edge (radial ring textures).
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    uv.setXY(i, (r - inner) / Math.max(1e-6, outer - inner), 0.5);
  }
  return g;
}

/** Geometry for a shape (tube spans are passed as their length). */
function buildGeometry(shape: PartShape, length: number): BufferGeometry | null {
  switch (shape.kind) {
    case 'sphere': {
      const w = shape.widthSegments ?? 32;
      const h = Math.max(8, Math.round(w * 0.7));
      return shape.hemisphere ? new SphereGeometry(shape.radius, w, Math.ceil(h / 2), 0, Math.PI * 2, 0, Math.PI / 2) : new SphereGeometry(shape.radius, w, h);
    }
    case 'box':
      return shape.bevel && shape.bevel > 0
        ? new RoundedBoxGeometry(shape.size[0], shape.size[1], shape.size[2], 3, Math.min(shape.bevel, Math.min(...shape.size) / 2 - 1e-4))
        : new BoxGeometry(...shape.size);
    case 'cylinder':
      return new CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, shape.segments ?? 32, 1, shape.openEnded);
    case 'capsule':
      return new CapsuleGeometry(shape.radius, shape.length, 8, 20);
    case 'torus':
      return new TorusGeometry(shape.radius, shape.tube, 10, shape.segments ?? 96, shape.arc ?? Math.PI * 2);
    case 'torusKnot':
      return new TorusKnotGeometry(shape.radius, shape.tube, 96, 14);
    case 'icosahedron':
      return new IcosahedronGeometry(shape.radius, shape.detail ?? 1);
    case 'ring':
      return ringGeometry(shape.inner, shape.outer, shape.segments ?? 96);
    case 'lathe':
      return new LatheGeometry(shape.profile.map(([r, y]) => new Vector2(Math.max(0, r), y)), shape.segments ?? 32);
    case 'polyline': {
      if (shape.points.length < 2) return null;
      const curve = new CatmullRomCurve3(shape.points.map((p) => new Vector3(...p)), !!shape.closed, 'centripetal');
      return new TubeGeometry(curve, Math.max(8, shape.points.length * 6), shape.radius, 8, !!shape.closed);
    }
    case 'tube':
      return new CylinderGeometry(shape.radius, shape.radius, length, 12);
    default:
      return null;
  }
}

const geoms = new Map<string, { geom: BufferGeometry; refs: number }>();

/** Shared geometry for a shape: parts with equal shapes (trace dots, electrons, edges) reuse one buffer. */
function useSharedGeometry(shape: PartShape, length = 0): BufferGeometry | null {
  const key = shape.kind === 'tube' ? `tube:${shape.radius.toFixed(5)}:${length.toFixed(5)}` : JSON.stringify(shape);
  const geom = useMemo(() => {
    const hit = geoms.get(key);
    if (hit) return hit.geom;
    const g = buildGeometry(shape, length);
    if (g) geoms.set(key, { geom: g, refs: 0 });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const e = geoms.get(key);
    if (!e) return;
    e.refs++;
    return () => {
      e.refs--;
      // Disposed only once no part uses it (a rebuild with the same shape picks it up again).
      setTimeout(() => {
        if (e.refs <= 0 && geoms.get(key) === e) {
          geoms.delete(key);
          e.geom.dispose();
        }
      }, 0);
    };
  }, [key]);
  return geom;
}

function PolygonGeometry({ points, uvScale }: { points: Vec3[]; uvScale: number }): JSX.Element {
  const geom = useMemo(() => polygonGeometry(points, uvScale), [points, uvScale]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <primitive object={geom} attach="geometry" />;
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

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface Preset {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity?: number;
}
const PRESETS: Record<Exclude<PartMaterial, 'glass' | 'emissive'>, Preset> = {
  plastic: { roughness: 0.32, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12 },
  matte: { roughness: 0.88, metalness: 0, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0.6 },
  metal: { roughness: 0.16, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.1, envMapIntensity: 1.2 },
  brushed: { roughness: 0.36, metalness: 1, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 1.1 },
  copper: { roughness: 0.26, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.2 },
  wood: { roughness: 0.55, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 },
  rubber: { roughness: 0.62, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6 },
};

/** Day/night terminator from a world-space Sun position, plus an optional atmosphere rim. */
interface SunlitData {
  __sun?: { pos: { value: Vector3 }; atmo: { value: Color } };
}
function installSunlit(m: Material, sun: Vec3, atmosphere: string | undefined): void {
  const ud = m.userData as SunlitData;
  if (ud.__sun) {
    ud.__sun.pos.value.set(...sun);
    ud.__sun.atmo.value.set(atmosphere ?? '#000000');
    return;
  }
  const u = { pos: { value: new Vector3(...sun) }, atmo: { value: new Color(atmosphere ?? '#000000') } };
  ud.__sun = u;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uSunPos = u.pos;
    shader.uniforms.uAtmo = u.atmo;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vSunWPos;\nvarying vec3 vSunWNormal;\nvoid main() {')
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\n\tvSunWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvSunWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uSunPos;\nuniform vec3 uAtmo;\nvarying vec3 vSunWPos;\nvarying vec3 vSunWNormal;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{
\t\tvec3 sN = normalize(vSunWNormal);
\t\tfloat ndl = dot(sN, normalize(uSunPos - vSunWPos));
\t\tfloat day = smoothstep(-0.1, 0.25, ndl);
\t\tvec3 refl = outgoingLight - totalEmissiveRadiance;
\t\t// Night side keeps a faint blue-grey so the body's outline still reads on a projector.
\t\toutgoingLight = refl * mix(vec3(0.09, 0.1, 0.14), vec3(1.0), day) * (0.6 + 0.55 * max(ndl, 0.0)) + totalEmissiveRadiance;
\t\tfloat fr = pow(1.0 - max(dot(sN, normalize(cameraPosition - vSunWPos)), 0.0), 2.2);
\t\toutgoingLight += uAtmo * fr * (0.08 + 0.9 * smoothstep(-0.25, 0.45, ndl));
\t}
\t#include <opaque_fragment>`,
      );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|sunlit`;
  m.needsUpdate = true;
}

interface MatProps {
  look: ConceptLook;
  part: Part;
  clip?: Plane[];
  container: boolean;
}

function textureFor(part: Part): { map: Texture | null; bump: Texture | null } {
  const kind = part.texture ?? (part.material === 'wood' ? 'wood' : undefined);
  if (!kind || kind === 'halo' || kind === 'rim') return { map: null, bump: null };
  const map = partTexture(kind);
  const bump = kind === 'moon' || kind === 'mercury' ? bumpTexture(kind) : null;
  return { map, bump };
}

function Mat({ look, part, clip, container }: MatProps) {
  const ref = useRef<Material>(null);
  const tex = useMemo(() => textureFor(part), [part.texture, part.material]); // eslint-disable-line react-hooks/exhaustive-deps
  const textured = !!tex.map;
  const sun = part.sunlit;
  // Hooks are installed before the first compile (child layout effects run before CompileGate's).
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    if (sun) installSunlit(m, sun, part.atmosphere);
    // Colours that live in a texture fade to grey through a uniform (look.color can't reach them).
    if (textured) setSaturation(m, look.saturation);
  });
  const flat = part.shape.kind === 'polygon' || part.shape.kind === 'ring';
  const side = container || flat ? DoubleSide : FrontSide;
  const alphaTex = part.texture === 'rings';
  const transparent = look.transparent || alphaTex;
  const depthWrite = look.depthWrite && !alphaTex;

  if (part.material === 'emissive') {
    // Self-lit: the Sun, a glowing filament. Colour × brightness, tone mapped like everything else.
    const k = Math.max(1, part.glow ?? 1);
    return (
      <meshBasicMaterial
        ref={ref as never}
        color={new Color(look.color).multiplyScalar(k)}
        map={tex.map}
        transparent={transparent}
        opacity={look.opacity}
        depthWrite={depthWrite}
        side={side}
        clippingPlanes={clip}
      />
    );
  }
  if (part.material === 'glass') {
    const op = look.transparent ? Math.min(look.opacity, 0.2) : Math.min(look.opacity, 0.32);
    return (
      <meshPhysicalMaterial
        ref={ref as never}
        color={look.color}
        emissive={look.emissive}
        emissiveIntensity={Math.max(look.emissiveIntensity, part.glow ?? 0)}
        roughness={part.roughness ?? 0.05}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.05}
        ior={1.5}
        specularIntensity={1}
        envMapIntensity={1.6}
        transparent
        opacity={op}
        depthWrite={false}
        side={side}
        clippingPlanes={clip}
      />
    );
  }
  const preset = part.material ? PRESETS[part.material] : null;
  return (
    <meshPhysicalMaterial
      ref={ref as never}
      color={look.color}
      map={tex.map}
      bumpMap={tex.bump}
      bumpScale={tex.bump ? 1.2 : 1}
      clearcoat={preset ? preset.clearcoat : container ? (look.opacity < 0.15 ? 0 : 0.6) : 0.55}
      envMapIntensity={preset?.envMapIntensity ?? (container && look.opacity < 0.15 ? 0.15 : 1)}
      clearcoatRoughness={preset?.clearcoatRoughness ?? 0.3}
      emissive={look.emissive}
      emissiveIntensity={Math.max(look.emissiveIntensity, part.glow ?? 0)}
      transparent={transparent}
      opacity={look.opacity}
      depthWrite={depthWrite}
      side={side}
      roughness={part.roughness ?? preset?.roughness ?? (container ? 0.2 : 0.38)}
      metalness={part.metalness ?? preset?.metalness ?? 0.05}
      clippingPlanes={clip}
      polygonOffset={part.shape.kind === 'polygon'}
      polygonOffsetFactor={1}
    />
  );
}

// ---------------------------------------------------------------------------
// Decorations: glow sprites, atmosphere rims, edge lines
// ---------------------------------------------------------------------------

function Halo({ color, size, strength, look, kind = 'halo' }: { color: string; size: number; strength: number; look: ConceptLook; kind?: 'halo' | 'rim' }) {
  const k = look.dimmed ? 0.3 : look.opacity < 0.2 ? look.opacity : 1;
  return (
    <sprite scale={[size, size, 1]} raycast={noRaycast} renderOrder={3}>
      <spriteMaterial map={partTexture(kind)} color={color} transparent opacity={strength * k} depthWrite={false} blending={AdditiveBlending} />
    </sprite>
  );
}

function Edges({ geometry, color, look }: { geometry: BufferGeometry; color: string; look: ConceptLook }) {
  const edges = useMemo(() => new EdgesGeometry(geometry, 25), [geometry]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <lineSegments geometry={edges} raycast={noRaycast} renderOrder={1}>
      <lineBasicMaterial color={color} transparent={look.transparent} opacity={look.opacity} depthWrite={look.depthWrite} />
    </lineSegments>
  );
}

function Decorations({ part, look, geometry }: { part: Part; look: ConceptLook; geometry: BufferGeometry | null }) {
  const s = part.shape;
  const r = s.kind === 'sphere' ? s.radius : 0;
  return (
    <>
      {part.halo && <Halo color={part.halo.color} size={part.halo.size} strength={part.halo.strength ?? 0.8} look={look} />}
      {part.atmosphere && r > 0 && <Halo kind="rim" color={part.atmosphere} size={2 * r * RIM_SPRITE_SCALE} strength={0.9} look={look} />}
      {part.edges && geometry && <Edges geometry={geometry} color={part.edges} look={look} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

function Instances({ shape, name, userData, look, part, clip, time }: { shape: Extract<PartShape, { kind: 'instances' }>; name: string; userData: Record<string, unknown>; look: ConceptLook; part: Part; clip?: Plane[]; time?: { current: number } }) {
  const ref = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const lastT = useRef(Number.NaN);
  useFrame(() => {
    const m = ref.current;
    const f = part.instanceMotion;
    if (!m || !f) return;
    const t = time?.current ?? 0;
    if (t === lastT.current) return;
    lastT.current = t;
    for (let i = 0; i < shape.positions.length; i++) {
      tmp.position.set(...f(t, i));
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
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
    <instancedMesh key={shape.positions.length} ref={ref} name={name} userData={userData} args={[undefined, undefined, shape.positions.length]} castShadow renderOrder={look.onTop ? FOCUS_RENDER_ORDER : 0}>
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
  time?: { current: number };
}

interface Common {
  name: string;
  userData: Record<string, unknown>;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  ref: (o: Object3D | null) => void;
}

interface BodyProps {
  part: Part;
  lk: ConceptLook;
  container: boolean;
  common: Common;
  pointer: object;
  childNodes: JSX.Element[];
  clip?: Plane[];
}

function MeshPart({ part, lk, container, common, pointer, childNodes, clip }: BodyProps) {
  const geom = useSharedGeometry(part.shape);
  if (!geom) return null;
  return (
    <mesh {...common} geometry={geom} castShadow={!container} {...pointer} renderOrder={lk.onTop ? FOCUS_RENDER_ORDER : container ? 2 : part.texture === 'rings' ? 1 : 0}>
      <Mat look={lk} part={part} clip={clip} container={container} />
      <Decorations part={part} look={lk} geometry={geom} />
      {childNodes}
    </mesh>
  );
}

function TubePart({ part, lk, container, common, pointer, childNodes, clip, span }: BodyProps & { span: { position: Vec3; quaternion: Quaternion; length: number } }) {
  const geom = useSharedGeometry(part.shape, span.length);
  return (
    <mesh {...common} geometry={geom ?? undefined} position={span.position} quaternion={span.quaternion} rotation={undefined} castShadow {...pointer} renderOrder={lk.onTop ? FOCUS_RENDER_ORDER : 0}>
      <Mat look={lk} part={part} clip={clip} container={container} />
      <Decorations part={part} look={lk} geometry={null} />
      {childNodes}
    </mesh>
  );
}

function PartNode({ part, childrenOf, look, userData, clip, register, time }: NodeProps): JSX.Element | null {
  const { look: lk, container } = look(part);
  const kids = childrenOf.get(part.name) ?? [];
  const ud = userData(part);
  const pointer = ud[CONCEPT_KEY_USERDATA] ? hoverHandlers : {};
  const childNodes = kids.map((k) => (
    <PartNode key={k.name} part={k} childrenOf={childrenOf} look={look} userData={userData} clip={clip} register={register} time={time} />
  ));
  const s = part.shape;
  const common: Common = {
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
        <Instances shape={s} name={part.name} userData={ud} look={lk} part={part} clip={clip} time={time} />
        {childNodes}
      </group>
    );
  }
  if (s.kind === 'text') {
    return <TextPart name={part.name} shape={s} color={part.color ?? '#ffffff'} look={lk} position={part.position} rotation={part.rotation} scale={part.scale} register={(o) => register(part.name, o)} />;
  }
  if (s.kind === 'polygon') {
    return (
      <mesh {...common} {...pointer} renderOrder={lk.onTop ? FOCUS_RENDER_ORDER : container ? 2 : 0}>
        <PolygonGeometry points={s.points} uvScale={part.textureScale ?? 1} />
        <Mat look={lk} part={part} clip={clip} container={container} />
        <Decorations part={part} look={lk} geometry={null} />
        {childNodes}
      </mesh>
    );
  }
  if (s.kind === 'tube' || s.kind === 'arrow') {
    const to: Vec3 = s.kind === 'tube' ? s.to : [s.from[0] + s.vector[0], s.from[1] + s.vector[1], s.from[2] + s.vector[2]];
    const span = spanTransform(s.from, to);
    const r = s.radius ?? 0.03;
    if (s.kind === 'tube') return <TubePart part={part} lk={lk} container={container} common={common} pointer={pointer} childNodes={childNodes} clip={clip} span={span} />;
    const head = Math.min(span.length * 0.35, r * 6);
    return (
      <group {...common} position={span.position} quaternion={span.quaternion} rotation={undefined}>
        <mesh position={[0, -head / 2, 0]} userData={ud} name={`${part.name}#shaft`} {...pointer} renderOrder={lk.onTop ? FOCUS_RENDER_ORDER : 0}>
          <cylinderGeometry args={[r, r, Math.max(0.001, span.length - head), 12]} />
          <Mat look={lk} part={part} clip={clip} container={container} />
        </mesh>
        <mesh position={[0, span.length / 2 - head / 2, 0]} userData={ud} name={`${part.name}#head`} {...pointer} renderOrder={lk.onTop ? FOCUS_RENDER_ORDER : 0}>
          <coneGeometry args={[r * 2.6, head, 16]} />
          <Mat look={lk} part={part} clip={clip} container={container} />
        </mesh>
        {childNodes}
      </group>
    );
  }
  return <MeshPart part={part} lk={lk} container={container} common={common} pointer={pointer} childNodes={childNodes} clip={clip} />;
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
        <PartNode key={p.name} part={p} childrenOf={childrenOf} look={look} userData={userData} clip={clippingPlanes} register={register} time={time} />
      ))}
    </group>
  );
}

/** Type guard used by plugins that keep refs to groups. */
export type PartsGroup = Group;
