/**
 * GLB scene (TZ W-20/W-21/W-25): loads the topic asset with meshopt + KTX2
 * support, binds nodes to concepts by name masks (`Mito_*`) from the topic
 * overrides, and applies the shared concept look (selection glow, hover,
 * dimming of the rest, ghost/hide). Without an asset it draws a procedural scene
 * named with the same node masks; while the asset downloads it draws nothing
 * and reports `loading` (the viewer shows a centred loader); when it fails
 * (404, parse error) cell topics get the ported Workbench cell and the rest
 * report `failed` (the viewer offers «Retry»). Failures are remembered per URL so a missing file is not
 * refetched on every mount.
 *
 * Nested containers: textured shells (a planet's crust) stay opaque with their
 * texture; in «whole» view only the outermost one is drawn, the inner layers
 * appear in «section». Untextured shells (membranes) stay translucent.
 */
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, DoubleSide, Material, Mesh, MeshStandardMaterial, Plane, Sphere, Vector3, type Object3D } from 'three';
import { KTX2Loader, type GLTFLoader } from 'three-stdlib';
import { conceptForNode, type ResolvedConcept } from '@bilig/content-model';
import { CONCEPT_KEY_USERDATA, type AssetStatus, type SceneProps, type ViewerState } from '@bilig/scene-core';
import { CompileGate, DIM_OPACITY, FOCUS_RENDER_ORDER, FOCUS_TINT, GHOST_OPACITY, GLOW_INTENSITY, HOVER_INTENSITY, HOVER_TINT, PartsView, conceptColor, hoverHandlers, lookFor, setSaturation, setTint, usePick } from '@bilig/scene-kit';
import { buildCell, cellKind } from './cells.js';
import { proceduralParts } from './layout.js';

export interface GltfPluginOptions {
  /** URL of the Basis/KTX2 transcoder directory (e.g. `/basis/`). KTX2 disabled when absent. */
  ktx2TranscoderPath?: string;
}

/** URLs that failed to load in this session. */
const failed = new Set<string>();

class LoadBoundary extends Component<{ fallback: ReactNode; url: string; children: ReactNode }, { failed: boolean; url: string }> {
  state = { failed: failed.has(this.props.url), url: this.props.url };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(p: { url: string }, s: { failed: boolean; url: string }) {
    return p.url !== s.url ? { failed: failed.has(p.url), url: p.url } : null;
  }
  componentDidCatch() {
    failed.add(this.props.url);
    useGLTF.clear(this.props.url);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Concept bound to a node: the node's own name or the nearest named ancestor. */
function conceptOf(obj: Object3D, concepts: readonly ResolvedConcept[]): string | null {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    if (o.userData?.noPick) return null;
    if (o.name) {
      const k = conceptForNode(o.name, concepts);
      if (k) return k;
    }
  }
  return null;
}

interface MatBase {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  emissive: Color;
  emissiveIntensity: number;
  /** Own colour: the selection lifts the structure in it (white for textured / vertex-coloured). */
  color: Color;
  textured: boolean;
}
const baseOf = (m: Material): MatBase => {
  const ud = m.userData as { __base?: MatBase; baseOpacity?: number };
  if (!ud.__base) {
    const std = m as MeshStandardMaterial;
    ud.__base = {
      opacity: ud.baseOpacity ?? m.opacity,
      transparent: m.transparent,
      depthWrite: m.depthWrite,
      emissive: std.emissive ? std.emissive.clone() : new Color(0),
      emissiveIntensity: std.emissiveIntensity ?? 0,
      color: std.color ? std.color.clone() : new Color(1, 1, 1),
      textured: !!std.map,
    };
  }
  return ud.__base;
};

/**
 * Apply the concept look to every mesh of a bound model. `procedural` models
 * carry their own designed opacities; loaded GLBs get the shared container
 * opacity for untextured shells.
 */
function applyLooks(root: Object3D, concepts: readonly ResolvedConcept[], state: ViewerState, clip: Plane[] | undefined, procedural: boolean): void {
  const byKey = new Map(concepts.map((c) => [c.key, c]));
  const section = state.modes.view === 'section';
  // Containers by size, outermost first. When any of them carries a texture
  // (a planet surface), all containers are solid layers rather than glass.
  const sizes = new Map<string, number>();
  let anyTextured = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const key = conceptOf(o, concepts);
    if (!key || !(o instanceof Mesh) || !byKey.get(key)?.isContainer) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[];
    if (!procedural && mats.some((m) => baseOf(m).textured)) anyTextured = true;
    const r = new Box3().setFromObject(o).getBoundingSphere(new Sphere()).radius;
    sizes.set(key, Math.max(sizes.get(key) ?? 0, r));
  });
  const shells = anyTextured ? [...sizes].map(([key, r]) => ({ key, r })).sort((a, b) => b.r - a.r) : [];
  const outerShell = shells[0]?.key;
  const innerShells = new Set(shells.slice(1).map((s) => s.key));

  root.traverse((o) => {
    const key = conceptOf(o, concepts);
    if (key) o.userData[CONCEPT_KEY_USERDATA] = key;
    else delete o.userData[CONCEPT_KEY_USERDATA];
    if (!(o instanceof Mesh)) return;
    const c = key ? byKey.get(key) : undefined;
    const textured = !!key && (key === outerShell || innerShells.has(key));
    const container = !!c?.isContainer && !textured;
    const look = lookFor(key ?? undefined, state, { hue: c?.hue, container });
    let visible = look.visible;
    if (key && innerShells.has(key) && !section) visible = false;
    o.visible = visible;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[];
    for (const m of mats) {
      const b = baseOf(m);
      let opacity = b.opacity;
      if (!key) {
        // Decorative parts follow the focus: they step back when something is selected.
        const focus = !!(state.selectedConceptKey || state.highlightConceptKey);
        opacity = focus ? b.opacity * 0.35 : b.opacity;
      } else if (look.opacity === GHOST_OPACITY) opacity = Math.min(b.opacity, GHOST_OPACITY);
      else if (container) {
        // Shells keep the see-through level their author gave them (a cytoplasm
        // is fainter than a membrane); stacked shells at one forced level would
        // wash the organelles out. Untuned (opaque) shells get the shared level.
        const own = procedural || b.transparent ? b.opacity : look.opacity;
        opacity = look.dimmed ? own * 0.5 : look.highlighted ? Math.max(own, Math.min(0.6, own * 1.8)) : own;
      }
      else if (look.dimmed) opacity = Math.min(b.opacity, DIM_OPACITY);
      // The structure in focus is drawn after the see-through rest (transparent
      // queue, later renderOrder), so the shells and dimmed parts in front of it
      // never veil it: it reads in full colour from any angle.
      const onTop = look.highlighted && !container && look.opacity !== GHOST_OPACITY;
      o.renderOrder = onTop ? FOCUS_RENDER_ORDER : container ? 2 : 0;
      m.opacity = opacity;
      m.transparent = onTop || opacity < 1 || b.transparent;
      m.depthWrite = onTop || opacity >= 0.6;
      if (c?.isContainer && !textured) m.side = DoubleSide;
      m.clippingPlanes = clip ?? null;
      // The structure in focus takes its concept colour — the colour of its chip,
      // label dot and card — over the model's own shading (the contour marks it,
      // SceneFx); whatever steps back fades towards grey.
      const focus = !!(state.selectedConceptKey || state.highlightConceptKey);
      const own = c ? conceptColor(c.hue) : null;
      setSaturation(m, look.highlighted || look.hovered ? 1 : key ? look.saturation : focus ? 0.25 : 1);
      setTint(m, own, look.highlighted ? FOCUS_TINT : look.hovered ? HOVER_TINT : 0);
      if (m instanceof MeshStandardMaterial) {
        if ((look.highlighted || look.hovered) && own) {
          m.emissive.set(own);
          m.emissiveIntensity = Math.max(b.emissiveIntensity, look.highlighted ? GLOW_INTENSITY : HOVER_INTENSITY);
        } else {
          m.emissive.copy(b.emissive);
          m.emissiveIntensity = b.emissiveIntensity;
        }
      }
      m.needsUpdate = true;
    }
  });
}

/** A bound object graph (loaded GLB or procedural cell) with picking and looks. */
function BoundModel({ root, concepts, state, onSelectConcept, clip, procedural }: SceneProps & { root: Object3D; clip?: Plane[]; procedural: boolean }): JSX.Element {
  useEffect(() => {
    applyLooks(root, concepts, state, clip, procedural);
  }, [root, concepts, state, clip, procedural]);
  const onClick = usePick(concepts, onSelectConcept);
  return <primitive object={root} onClick={onClick} {...hoverHandlers} />;
}

let ktx2: KTX2Loader | null = null;

function LoadedModel(props: SceneProps & { url: string; opts: GltfPluginOptions; clip?: Plane[] }): JSX.Element {
  const { url, opts } = props;
  const gl = useThree((s) => s.gl);
  const gltf = useGLTF(url, false, true, (loader: GLTFLoader) => {
    if (opts.ktx2TranscoderPath) {
      ktx2 ??= new KTX2Loader().setTranscoderPath(opts.ktx2TranscoderPath).detectSupport(gl);
      loader.setKTX2Loader(ktx2);
    }
  });
  // Own copy with per-mesh materials so concept looks never leak between meshes.
  const root = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.material = Array.isArray(o.material) ? o.material.map((m: Material) => m.clone()) : (o.material as Material).clone();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => setSaturation(m, 1));
      }
    });
    return scene;
  }, [gltf.scene]);
  // The GLB arrives after the first frame: compile its materials before it shows.
  return (
    <CompileGate>
      <BoundModel {...props} root={root} procedural={false} />
    </CompileGate>
  );
}

/** Reports a download state to the viewer while mounted (Suspense / error fallbacks). */
function Status({ status, onStatus }: { status: AssetStatus; onStatus?: (s: AssetStatus) => void }): null {
  useEffect(() => onStatus?.(status), [status, onStatus]);
  return null;
}

function ProceduralCell(props: SceneProps & { clip?: Plane[]; kind: 'animal' | 'plant' }): JSX.Element {
  const { kind, concepts } = props;
  const root = useMemo(() => {
    const r = buildCell(kind, concepts);
    r.traverse((o) => {
      if (o instanceof Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => setSaturation(m, 1));
    });
    return r;
  }, [kind, concepts]);
  useEffect(
    () => () =>
      root.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => m.dispose());
        }
      }),
    [root],
  );
  return <BoundModel {...props} root={root} procedural />;
}

/** Plugin component: section mode = local clipping plane through the model's centre (z ≤ 0 kept). */
export function makeGltfScene(opts: GltfPluginOptions) {
  return function GltfScene(props: SceneProps): JSX.Element {
    const gl = useThree((s) => s.gl);
    const section = props.state.modes.view === 'section';
    useEffect(() => {
      gl.localClippingEnabled = true;
    }, [gl]);
    const clip = useMemo(() => (section ? [new Plane(new Vector3(0, 0, -1), 0)] : undefined), [section]);
    const parts = useMemo(() => proceduralParts(props.concepts), [props.concepts]);
    const kind = useMemo(() => cellKind(props.concepts), [props.concepts]);
    const asset = props.topic.scene.asset;
    const url = asset && props.assetBaseUrl ? props.assetBaseUrl.replace(/\/?$/, '/') + asset : null;
    // A topic without a file draws its authored stand-in. A file that is still
    // downloading draws nothing (the viewer shows a centred loader); a file that
    // failed shows the procedural cell where there is one, else the viewer's
    // «could not load» message — never generic blobs posing as the model.
    const standIn = kind ? (
      <ProceduralCell {...props} clip={clip} kind={kind} />
    ) : (
      <PartsView parts={parts} concepts={props.concepts} state={props.state} onSelectConcept={props.onSelectConcept} clippingPlanes={clip} containerOpacity={0.2} />
    );
    const onStatus = props.onAssetStatus;
    useEffect(() => {
      if (!url || !props.retryNonce) return;
      failed.delete(url);
      useGLTF.clear(url);
    }, [url, props.retryNonce]);
    if (!url) return standIn;
    const onFail = kind ? (
      <>
        {standIn}
        <Status status="ready" onStatus={onStatus} />
      </>
    ) : (
      <Status status="failed" onStatus={onStatus} />
    );
    if (failed.has(url)) return onFail;
    return (
      <LoadBoundary key={`${url}#${props.retryNonce ?? 0}`} fallback={onFail} url={url}>
        <Suspense fallback={<Status status="loading" onStatus={onStatus} />}>
          <LoadedModel {...props} url={url} opts={opts} clip={clip} />
          <Status status="ready" onStatus={onStatus} />
        </Suspense>
      </LoadBoundary>
    );
  };
}
