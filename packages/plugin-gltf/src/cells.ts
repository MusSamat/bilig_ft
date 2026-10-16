/**
 * Procedural cell models (ported from the approved «Bilig Workbench»
 * prototype): animal and plant cells built with three.js, one named group per
 * structure. Groups are named with the topic's node masks (`Membrane`,
 * `Nucleus`, `Mito_1…`, `Ribo_1`, `Golgi`, `CellWall`, `Vacuole`,
 * `Chloro_1…`, `Cytoplasm`), so the same node → concept binding as a real GLB
 * applies. Main colours come from the concept hue (so a structure looks the
 * same in 3D, in its chip and in its label); details are darker/lighter tints.
 * Used as the stand-in while a topic's GLB is missing or fails to load.
 */
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector3,
  type Side,
  type Texture,
} from 'three';
import { conceptForNode, type ResolvedConcept } from '@bilig/content-model';
import { conceptColor } from '@bilig/scene-core';

type CellConcept = Pick<ResolvedConcept, 'key' | 'hue' | 'nodes' | 'isContainer'>;
export type CellKind = 'animal' | 'plant';

/** Which procedural cell the topic's node masks describe (null = not a cell). */
export function cellKind(concepts: readonly CellConcept[]): CellKind | null {
  const names = new Set(concepts.flatMap((c) => c.nodes ?? []));
  const has = (n: string) => names.has(n);
  if (!has('Membrane') || !has('Nucleus')) return null;
  if (has('CellWall') || has('Vacuole') || names.has('Chloro_*')) return 'plant';
  return 'animal';
}

/* ---------- deterministic helpers (prototype) ---------- */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let noise: Texture | null = null;
let fiber: Texture | null = null;
function noiseTex(): Texture | null {
  if (noise || typeof document === 'undefined') return noise;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  if (!x) return null;
  const R = rng(3);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    x.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + R() * 0.12})`;
    x.beginPath();
    x.arc(R() * 256, R() * 256, 1 + R() * 5, 0, 6.283);
    x.fill();
  }
  noise = new CanvasTexture(c);
  noise.wrapS = noise.wrapT = RepeatWrapping;
  return noise;
}
function fiberTex(): Texture | null {
  if (fiber || typeof document === 'undefined') return fiber;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  if (!x) return null;
  const R = rng(9);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 256, 256);
  x.lineWidth = 1.4;
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.08 + R() * 0.14})`;
    x.beginPath();
    const y = R() * 256;
    x.moveTo(0, y);
    x.bezierCurveTo(85, y + R() * 24 - 12, 170, y + R() * 24 - 12, 256, y + R() * 10 - 5);
    x.stroke();
  }
  fiber = new CanvasTexture(c);
  fiber.wrapS = fiber.wrapT = RepeatWrapping;
  fiber.repeat.set(3, 3);
  return fiber;
}

interface MatOpts {
  o?: number;
  r?: number;
  m?: number;
  cc?: number;
  side?: Side;
  bump?: Texture | null;
  bs?: number;
  em?: string;
  ei?: number;
}
/** Physical material; its base opacity is remembered for the concept look. */
function M(color: string, o: MatOpts = {}): MeshPhysicalMaterial {
  const op = o.o ?? 1;
  const m = new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: o.r ?? 0.42,
    metalness: o.m ?? 0,
    transparent: op < 1,
    opacity: op,
    side: o.side ?? FrontSide,
    clearcoat: o.cc ?? 0,
    clearcoatRoughness: 0.3,
    emissive: new Color(o.em ?? '#000000'),
    emissiveIntensity: o.ei ?? 0,
  });
  if (o.bump) {
    m.bumpMap = o.bump;
    m.bumpScale = o.bs ?? 0.02;
  }
  if (op < 0.6) m.depthWrite = false;
  m.userData = { baseOpacity: op, baseEmissive: o.em ?? '#000000', baseEmissiveIntensity: o.ei ?? 0 };
  return m;
}
const mesh = (g: BufferGeometry, m: MeshPhysicalMaterial) => new Mesh(g, m);

function blob(r: number, amp: number, seed: number): BufferGeometry {
  const g = new SphereGeometry(r, 48, 36);
  const p = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + amp * Math.sin((3 * v.x) / r + seed) * Math.sin((4 * v.y) / r + 1) * Math.sin((5 * v.z) / r + 2);
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}
function squircle(sx: number, sy: number, sz: number, n: number): BufferGeometry {
  const g = new SphereGeometry(1, 56, 40);
  const p = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    p.setXYZ(i, Math.sign(v.x) * Math.abs(v.x) ** n * sx, Math.sign(v.y) * Math.abs(v.y) ** n * sy, Math.sign(v.z) * Math.abs(v.z) ** n * sz);
  }
  g.computeVertexNormals();
  return g;
}
function fib(n: number, r: number): Vector3[] {
  const a: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const t = i * 2.39996;
    a.push(new Vector3(Math.cos(t) * rr * r, y * r, Math.sin(t) * rr * r));
  }
  return a;
}

/** Shade a CSS hsl() colour (lightness delta in %). */
function tint(color: string, dl: number, ds = 0): string {
  const c = new Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + ds / 100)), Math.min(1, Math.max(0, hsl.l + dl / 100)));
  return `#${c.getHexString()}`;
}

interface Ctx {
  root: Group;
  color(node: string, fallback: string): string;
  named(name: string, parent?: Object3D): Group;
}

function makeCtx(concepts: readonly CellConcept[]): Ctx {
  const root = new Group();
  root.name = 'ProceduralCell';
  root.userData.ownAnchors = true;
  return {
    root,
    color(node, fallback) {
      const key = conceptForNode(node, concepts as ResolvedConcept[]);
      const c = key ? concepts.find((x) => x.key === key) : undefined;
      return c ? conceptColor(c.hue, 62, 62) : fallback;
    },
    named(name, parent) {
      const g = new Group();
      g.name = name;
      (parent ?? root).add(g);
      return g;
    },
  };
}

/** Decorative (never picked, never bound to a concept). */
function decor(ctx: Ctx, o: Object3D): Object3D {
  o.userData.noPick = true;
  o.name = '';
  ctx.root.add(o);
  return o;
}

function cytoPoints(ctx: Ctx, ax: [number, number, number], n: number, seed: number): void {
  const R = rng(seed);
  const p: number[] = [];
  while (p.length < n * 3) {
    const x = R() * 2 - 1;
    const y = R() * 2 - 1;
    const z = R() * 2 - 1;
    if (x * x + y * y + z * z > 1) continue;
    p.push(x * ax[0], y * ax[1], z * ax[2]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  decor(ctx, new Points(g, new PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false })));
}

function nucleus(ctx: Ctx, pos: Vector3, sc: number): void {
  const col = ctx.color('Nucleus', '#6C7BE0');
  const g = ctx.named('Nucleus');
  g.position.copy(pos);
  g.scale.setScalar(sc);
  g.add(mesh(blob(0.95, 0.035, 1), M(col, { o: 0.78, r: 0.5, bump: noiseTex(), bs: 0.05, cc: 0.5 })));
  const pm = M(tint(col, -18), { r: 0.5 });
  const tg = new TorusGeometry(0.07, 0.022, 8, 18);
  for (const p of fib(30, 0.965)) {
    const t = mesh(tg, pm);
    t.position.copy(p);
    t.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), p.clone().normalize());
    g.add(t);
  }
  const nl = ctx.named('Nucleolus', g);
  const n = mesh(blob(0.36, 0.09, 4), M(tint(col, -28), { r: 0.65, bump: noiseTex(), bs: 0.06 }));
  n.position.set(0.15, 0.1, 0.3);
  nl.add(n);
}

function mito(ctx: Ctx, name: string, pos: Vector3, rot: [number, number, number], sc: number): void {
  const col = ctx.color(name, '#F08A5D');
  const g = ctx.named(name);
  g.position.copy(pos);
  g.rotation.set(...rot);
  g.scale.setScalar(sc);
  g.add(mesh(new CapsuleGeometry(0.3, 0.85, 10, 28), M(col, { o: 0.7, r: 0.35, cc: 0.8, bump: noiseTex(), bs: 0.02 })));
  const cm = M(tint(col, 18), { r: 0.5 });
  for (let i = 0; i < 6; i++) {
    const d = mesh(new CylinderGeometry(0.21, 0.21, 0.03, 24), cm);
    d.position.y = -0.44 + i * 0.176;
    d.rotation.z = i % 2 ? 0.12 : -0.12;
    g.add(d);
  }
  g.add(mesh(new CapsuleGeometry(0.23, 0.8, 8, 20), M(tint(col, -10), { o: 0.4, r: 0.6 })));
}

function chloro(ctx: Ctx, name: string, pos: Vector3, rot: [number, number, number]): void {
  const col = ctx.color(name, '#4FAE5B');
  const g = ctx.named(name);
  g.position.copy(pos);
  g.rotation.set(...rot);
  const e = mesh(new SphereGeometry(0.42, 40, 28), M(col, { o: 0.75, r: 0.35, cc: 0.7, bump: noiseTex(), bs: 0.02 }));
  e.scale.set(1.75, 1, 0.95);
  g.add(e);
  const gm = M(tint(col, -24), { r: 0.5 });
  for (const x of [-0.45, 0, 0.45]) {
    for (let i = 0; i < 5; i++) {
      const d = mesh(new CylinderGeometry(0.13, 0.13, 0.035, 20), gm);
      d.position.set(x, -0.2 + i * 0.085, 0);
      g.add(d);
    }
  }
  const st = mesh(new CylinderGeometry(0.02, 0.02, 0.9, 8), gm);
  st.rotation.z = Math.PI / 2;
  st.position.y = -0.02;
  g.add(st);
}

function ribosomes(ctx: Ctx, count: number, inside: (x: number, y: number, z: number) => boolean, extent: [number, number, number], seed: number): void {
  const col = ctx.color('Ribo_1', '#3C4252');
  const g = ctx.named('Ribo_1');
  const im = new InstancedMesh(new SphereGeometry(0.075, 12, 10), M(tint(col, -6), { r: 0.45, cc: 0.4 }), count);
  const R = rng(seed);
  const dm = new Object3D();
  let c = 0;
  let guard = 0;
  while (c < count && guard++ < count * 200) {
    const x = (R() * 2 - 1) * extent[0];
    const y = (R() * 2 - 1) * extent[1];
    const z = (R() * 2 - 1) * extent[2];
    if (!inside(x, y, z)) continue;
    dm.position.set(x, y, z);
    dm.updateMatrix();
    im.setMatrixAt(c++, dm.matrix);
  }
  im.count = c;
  im.computeBoundingSphere();
  g.add(im);
}

function cytoplasm(ctx: Ctx, geom: BufferGeometry, color: string): void {
  // A faint inner volume so the cytoplasm can be selected and highlighted.
  const g = ctx.named('Cytoplasm');
  g.add(mesh(geom, M(ctx.color('Cytoplasm', color), { o: 0.08, side: DoubleSide, r: 0.4 })));
}

function animalCell(concepts: readonly CellConcept[]): Group {
  const ctx = makeCtx(concepts);
  const memCol = ctx.color('Membrane', '#7FD6C2');
  const mem = ctx.named('Membrane');
  const sh = mesh(blob(2.7, 0.025, 2), M(memCol, { o: 0.2, side: DoubleSide, r: 0.18, cc: 1, bump: noiseTex(), bs: 0.008 }));
  sh.scale.set(1.18, 0.95, 1);
  mem.add(sh);
  const s2 = mesh(new SphereGeometry(2.78, 64, 48), M(tint(memCol, 22), { o: 0.07, side: BackSide, r: 0.3 }));
  s2.scale.copy(sh.scale);
  mem.add(s2);
  const cyto = blob(2.55, 0.02, 5);
  cyto.scale(1.18, 0.95, 1);
  cytoplasm(ctx, cyto, '#C4F1E6');

  nucleus(ctx, new Vector3(0.35, 0.15, 0), 1);
  mito(ctx, 'Mito_1', new Vector3(-1.2, 1.0, 0.5), [0, 0, 0.9], 1);
  mito(ctx, 'Mito_2', new Vector3(1.95, -1.0, 0.7), [0.4, 0, -0.7], 1);
  mito(ctx, 'Mito_3', new Vector3(-0.2, -1.55, -0.7), [1.1, 0, 0.5], 1);
  mito(ctx, 'Mito_4', new Vector3(2.1, 0.9, -0.6), [0.3, 0.5, 1.4], 0.85);

  const golCol = ctx.color('Golgi', '#F2B84B');
  const gol = ctx.named('Golgi');
  gol.position.set(-1.65, -0.5, 0.6);
  gol.rotation.z = 0.35;
  for (let i = 0; i < 6; i++) {
    const tr = mesh(new TorusGeometry(0.62 - 0.045 * Math.abs(i - 2.5), 0.06, 14, 48, Math.PI * 1.15), M(golCol, { r: 0.35, cc: 0.5 }));
    tr.rotation.x = Math.PI / 2;
    tr.position.y = i * 0.17 - 0.42;
    gol.add(tr);
  }
  for (const p of [
    [0.75, 0.1, 0.3],
    [-0.55, 0.05, 0.55],
    [0.1, 0.4, -0.68],
    [0.85, -0.2, -0.3],
  ] as const) {
    const v = mesh(new SphereGeometry(0.09, 16, 12), M(golCol, { cc: 0.5 }));
    v.position.set(p[0], p[1] - 0.5, p[2]);
    gol.add(v);
  }

  // Endoplasmic reticulum (no concept in this topic): decorative, like the lysosomes.
  const er = new Group();
  er.position.set(0.35, 0.15, 0);
  er.scale.set(1, 0.85, 1);
  er.add(mesh(new TorusKnotGeometry(1.45, 0.065, 220, 12, 2, 3), M('#B48CF2', { o: 0.55, r: 0.35, cc: 0.4 })));
  decor(ctx, er);

  ribosomes(
    ctx,
    80,
    (x, y, z) => x * x / 9.5 + y * y / 6.3 + z * z / 6.8 <= 1 && Math.hypot(x - 0.35, y - 0.15, z) >= 1.25 && Math.hypot(x + 1.65, y + 0.5, z - 0.6) >= 1,
    [2.9, 2.3, 2.4],
    7,
  );
  const lm = M('#9B6FD6', { o: 0.85, cc: 0.6 });
  for (const p of [
    [-0.5, 1.6, -0.4],
    [1.2, 1.6, 0.4],
    [-2.2, 0.5, -0.8],
    [0.9, -1.9, -0.2],
    [-1.0, -0.6, 1.8],
  ] as const) {
    const l = mesh(new SphereGeometry(0.17, 20, 14), lm);
    l.position.set(p[0], p[1], p[2]);
    decor(ctx, l);
  }
  cytoPoints(ctx, [3.0, 2.4, 2.5], 520, 7);
  return ctx.root;
}

function plantCell(concepts: readonly CellConcept[]): Group {
  const ctx = makeCtx(concepts);
  const wallCol = ctx.color('CellWall', '#9DBF5A');
  const wall = ctx.named('CellWall');
  wall.add(mesh(squircle(3.35, 2.25, 2.25, 0.5), M(wallCol, { o: 0.26, side: DoubleSide, r: 0.55, bump: fiberTex(), bs: 0.03 })));
  wall.add(mesh(squircle(3.45, 2.35, 2.35, 0.5), M(tint(wallCol, 24), { o: 0.12, side: BackSide, r: 0.5 })));
  const mem = ctx.named('Membrane');
  mem.add(mesh(squircle(3.12, 2.05, 2.05, 0.5), M(ctx.color('Membrane', '#7FD6C2'), { o: 0.16, side: DoubleSide, r: 0.2, cc: 1 })));
  cytoplasm(ctx, squircle(2.98, 1.92, 1.92, 0.5), '#C4F1E6');
  const vac = ctx.named('Vacuole');
  const vc = mesh(new SphereGeometry(1.2, 56, 40), M(ctx.color('Vacuole', '#8CCBF5'), { o: 0.55, r: 0.08, cc: 1 }));
  vc.scale.set(1.35, 0.95, 0.95);
  vc.position.set(-0.8, 0, 0.1);
  vac.add(vc);
  nucleus(ctx, new Vector3(1.95, 0.55, -0.2), 0.68);
  const ch: [Vector3, [number, number, number]][] = [
    [new Vector3(-0.4, 1.55, 0.8), [0, 0.3, 0.1]],
    [new Vector3(0.8, -1.55, 0.9), [0, -0.2, -0.1]],
    [new Vector3(2.2, -0.85, 0.6), [0.4, 0, 0.6]],
    [new Vector3(-2.5, -1.05, 0.5), [0, 0.5, -0.4]],
    [new Vector3(-1.9, 1.2, -0.9), [0.2, 0, 0.2]],
    [new Vector3(0.6, 1.5, -0.9), [0, -0.4, 0.2]],
  ];
  ch.forEach(([p, r], i) => chloro(ctx, `Chloro_${i + 1}`, p, r));
  mito(ctx, 'Mito_1', new Vector3(0.9, 1.35, -0.8), [0, 0, 1.2], 0.7);
  mito(ctx, 'Mito_2', new Vector3(-0.9, -1.25, -0.9), [0.8, 0, 0.4], 0.7);
  cytoPoints(ctx, [3.0, 1.95, 1.95], 420, 8);
  return ctx.root;
}

/** Build the procedural cell for the topic (a new object graph each call). */
export function buildCell(kind: CellKind, concepts: readonly CellConcept[]): Group {
  const g = kind === 'plant' ? plantCell(concepts) : animalCell(concepts);
  g.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true;
  });
  return g;
}
