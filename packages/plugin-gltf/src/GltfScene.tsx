/**
 * GLB scene (TZ W-20/W-21/W-25): loads the topic asset with meshopt + KTX2
 * support, binds nodes to concepts by name masks (`Mito_*`) from the topic
 * overrides, and applies the shared concept look. Falls back to the
 * procedural scene — named with the same node masks — when there is no asset
 * or it fails to load (404, parse error); failures are remembered per URL so
 * a missing file is not refetched on every mount.
 */
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { DoubleSide, Material, Mesh, MeshStandardMaterial, Plane, Vector3, type Object3D } from 'three';
import { KTX2Loader, type GLTFLoader } from 'three-stdlib';
import { conceptForNode, type ResolvedConcept } from '@bilig/content-model';
import { CONCEPT_KEY_USERDATA, type SceneProps } from '@bilig/scene-core';
import { PartsView, hoverHandlers, lookFor, usePick } from '@bilig/scene-kit';
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
    if (o.name) {
      const k = conceptForNode(o.name, concepts);
      if (k) return k;
    }
  }
  return null;
}

let ktx2: KTX2Loader | null = null;

function LoadedModel({ url, opts, clip, concepts, state, onSelectConcept }: SceneProps & { url: string; opts: GltfPluginOptions; clip?: Plane[] }): JSX.Element {
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
        o.castShadow = true;
      }
    });
    return scene;
  }, [gltf.scene]);

  const byKey = useMemo(() => new Map(concepts.map((c) => [c.key, c])), [concepts]);

  useEffect(() => {
    root.traverse((o) => {
      const key = conceptOf(o, concepts);
      if (key) o.userData[CONCEPT_KEY_USERDATA] = key;
      else delete o.userData[CONCEPT_KEY_USERDATA];
      if (!(o instanceof Mesh)) return;
      const c = key ? byKey.get(key) : undefined;
      const look = lookFor(key ?? undefined, state, { hue: c?.hue, container: c?.isContainer });
      o.visible = look.visible;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[];
      for (const m of mats) {
        m.transparent = look.transparent;
        m.opacity = look.opacity;
        m.depthWrite = look.depthWrite;
        if (c?.isContainer) m.side = DoubleSide;
        m.clippingPlanes = clip ?? null;
        if (m instanceof MeshStandardMaterial) {
          m.emissive.set(look.highlighted ? look.emissive : '#000000');
          m.emissiveIntensity = look.highlighted ? look.emissiveIntensity : 0;
        }
        m.needsUpdate = true;
      }
    });
  }, [root, concepts, byKey, state, clip]);

  const onClick = usePick(concepts, onSelectConcept);
  return <primitive object={root} onClick={onClick} {...hoverHandlers} />;
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
    const asset = props.topic.scene.asset;
    const url = asset && props.assetBaseUrl ? props.assetBaseUrl.replace(/\/?$/, '/') + asset : null;
    const fallback = (
      <PartsView parts={parts} concepts={props.concepts} state={props.state} onSelectConcept={props.onSelectConcept} clippingPlanes={clip} containerOpacity={0.2} />
    );
    if (!url || failed.has(url)) return fallback;
    return (
      <LoadBoundary fallback={fallback} url={url}>
        <Suspense fallback={fallback}>
          <LoadedModel {...props} url={url} opts={opts} clip={clip} />
        </Suspense>
      </LoadBoundary>
    );
  };
}
