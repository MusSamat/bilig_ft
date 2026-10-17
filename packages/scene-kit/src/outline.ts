/**
 * Selection outline (W-22): a screen-space «inverted hull». The structure in
 * focus gets a crisp gold contour of constant width in pixels, with a soft
 * dark halo outside it so it reads on light and dark stages and on a
 * classroom projector. Unlike an emissive glow it never washes out the
 * structure's own colours, and unlike a post-processing outline it costs one
 * extra draw of the selected meshes only (no render targets, works with the
 * transparent canvas, section clipping and instancing).
 *
 * The hull uses a copy of the mesh geometry with vertices welded and smooth
 * normals, so hard-edged shapes (boxes, faceted crystals) get a closed
 * contour instead of gaps at the corners. Flat geometry (faces, polygons) has
 * no hull; those keep the colour highlight only.
 */
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  ShaderMaterial,
  AlwaysStencilFunc,
  KeepStencilOp,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
  type Plane,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOCUS_RENDER_ORDER, GLOW_COLOR } from './look.js';

export type OutlineStyle = 'focus' | 'hover';

/** Contour layers per style: [colour, opacity, width in CSS px], outermost first. */
export const OUTLINE_LAYERS: Record<OutlineStyle, ReadonlyArray<readonly [string, number, number]>> = {
  focus: [
    ['#1b1f2a', 0.32, 5.5],
    [GLOW_COLOR, 1, 3],
  ],
  hover: [['#ffffff', 0.85, 1.75]],
};

const vertexShader = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
uniform float width;
uniform vec2 resolution;
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 mvPosition = modelViewMatrix * local;
  vec4 clip = projectionMatrix * mvPosition;
  vec2 dir = (projectionMatrix * vec4(normalMatrix * n, 0.0)).xy;
  float len = length(dir);
  if (len > 1e-6) clip.xy += dir / len * width * 2.0 / resolution * clip.w;
  gl_Position = clip;
  #include <clipping_planes_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 color;
uniform float opacity;
void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4(color, opacity);
  #include <colorspace_fragment>
}
`;

/** Stencil value the outlined structures write (the canvas needs `stencil: true`). */
export const STENCIL_REF = 1;

/** Let a structure's own materials write its silhouette into the stencil buffer (or stop). */
function markSilhouette(mesh: Mesh, on: boolean): void {
  for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
    if (m.stencilWrite === on && (!on || m.stencilZPass === ReplaceStencilOp)) continue;
    m.stencilWrite = on;
    m.stencilRef = STENCIL_REF;
    m.stencilFunc = AlwaysStencilFunc;
    m.stencilFail = on ? ReplaceStencilOp : KeepStencilOp;
    m.stencilZFail = on ? ReplaceStencilOp : KeepStencilOp;
    m.stencilZPass = on ? ReplaceStencilOp : KeepStencilOp;
  }
}

/** Shared resolution uniform (CSS px of the canvas), updated by the viewer. */
export const outlineResolution = { value: new Vector2(1024, 768) };

export function outlineMaterial(color: string, opacity: number, width: number): ShaderMaterial {
  return new ShaderMaterial({
    name: 'bilig-outline',
    uniforms: {
      color: { value: new Color(color) },
      opacity: { value: opacity },
      width: { value: width },
      resolution: outlineResolution,
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    // Transparent queue: drawn after the see-through rest and the focused part.
    transparent: true,
    depthWrite: false,
    // Only outside the structure's silhouette (stencil, see markSilhouette):
    // a see-through shell (membrane, pericardium) gets a contour, not a
    // filled disc, and the contour stays whole where other parts cover it.
    depthTest: false,
    stencilWrite: true,
    stencilWriteMask: 0,
    stencilRef: STENCIL_REF,
    stencilFunc: NotEqualStencilFunc,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: KeepStencilOp,
    toneMapped: false,
    clipping: true,
  });
}

const hulls = new WeakMap<BufferGeometry, BufferGeometry | null>();

/** Welded copy with smooth normals for the hull, or null for flat / unusable geometry. */
export function hullGeometry(src: BufferGeometry): BufferGeometry | null {
  if (hulls.has(src)) return hulls.get(src)!;
  let out: BufferGeometry | null = null;
  const pos = src.getAttribute('position');
  if (pos && pos.count >= 3) {
    if (!src.boundingBox) src.computeBoundingBox();
    const size = src.boundingBox!.getSize(new Vector3());
    const max = Math.max(size.x, size.y, size.z);
    const min = Math.min(size.x, size.y, size.z);
    if (max > 0 && min > max * 1e-3) {
      // Plain float copy: GLB positions may be quantised or interleaved.
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        arr[i * 3] = pos.getX(i);
        arr[i * 3 + 1] = pos.getY(i);
        arr[i * 3 + 2] = pos.getZ(i);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(arr, 3));
      if (src.index) g.setIndex(src.index.clone());
      out = mergeVertices(g, max * 1e-4);
      out.computeVertexNormals();
      g.dispose();
      src.addEventListener('dispose', () => {
        out?.dispose();
        hulls.delete(src);
      });
    }
  }
  hulls.set(src, out);
  return out;
}

interface OutlineState {
  style: OutlineStyle;
  layers: Mesh[];
}
const KEY = '__biligOutline';

const noRaycast = () => {};

/** Materials per style, built once. */
let mats: Record<OutlineStyle, ShaderMaterial[]> | null = null;
function materials(): Record<OutlineStyle, ShaderMaterial[]> {
  mats ??= {
    focus: OUTLINE_LAYERS.focus.map(([c, o, w]) => outlineMaterial(c, o, w)),
    hover: OUTLINE_LAYERS.hover.map(([c, o, w]) => outlineMaterial(c, o, w)),
  };
  return mats;
}

function clipOf(mesh: Mesh): Plane[] | null {
  const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined;
  return m?.clippingPlanes ?? null;
}

/** Add, restyle or remove the contour of one mesh. Returns true when it carries one. */
export function setOutline(mesh: Mesh, style: OutlineStyle | null): boolean {
  const cur = mesh.userData[KEY] as OutlineState | undefined;
  if (cur && cur.style === style) {
    markSilhouette(mesh, true);
    const clip = clipOf(mesh);
    for (const l of cur.layers) {
      const lm = l.material as ShaderMaterial;
      if (lm.clippingPlanes !== clip) {
        lm.clippingPlanes = clip;
        lm.needsUpdate = true;
      }
      if (l instanceof InstancedMesh && mesh instanceof InstancedMesh) l.count = mesh.count;
    }
    return true;
  }
  if (cur) {
    for (const l of cur.layers) mesh.remove(l);
    delete mesh.userData[KEY];
    markSilhouette(mesh, false);
  }
  if (!style) return false;
  const hull = hullGeometry(mesh.geometry);
  if (!hull) return false;
  const clip = clipOf(mesh);
  const layers = materials()[style].map((m, i) => {
    if (m.clippingPlanes !== clip) {
      m.clippingPlanes = clip;
      m.needsUpdate = true;
    }
    let l: Mesh;
    if (mesh instanceof InstancedMesh) {
      const im = new InstancedMesh(hull, m, mesh.count);
      im.instanceMatrix = mesh.instanceMatrix;
      l = im;
    } else l = new Mesh(hull, m);
    l.name = '';
    l.userData = { outline: true };
    l.raycast = noRaycast;
    l.castShadow = false;
    l.receiveShadow = false;
    l.frustumCulled = mesh.frustumCulled;
    // Outer halo first, the gold line on top of it.
    l.renderOrder = FOCUS_RENDER_ORDER + 1 + i;
    mesh.add(l);
    return l;
  });
  markSilhouette(mesh, true);
  mesh.userData[KEY] = { style, layers } satisfies OutlineState;
  return true;
}

/** Is this object one of the contour meshes (skip it when indexing the scene)? */
export const isOutline = (o: Object3D): boolean => !!o.userData?.outline;
