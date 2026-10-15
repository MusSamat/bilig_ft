/**
 * The shared 3D viewer core (TZ W-20..W-26) — identical for every plugin.
 * It owns the canvas, environment lighting, contact shadow, orbit controls
 * (mouse, touch, wheel, pinch), the camera flight to the selected structure,
 * label placement without overlaps, adaptive resolution (PerformanceMonitor)
 * and snapshot capture. Plugins only draw meshes tagged with
 * `userData.conceptKey`. Loaded as a lazy chunk with three.js.
 */
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { t as tr, type Camera, type ResolvedConcept, type Topic, type Vec3 } from '@bilig/content-model';
import { CONCEPT_KEY_USERDATA, placeLabels, type ScenePlugin, type ViewerState } from '@bilig/scene-core';
import { sceneHandle } from '../state/viewer';

export interface SceneViewerProps {
  topic: Topic;
  concepts: ResolvedConcept[];
  plugin: ScenePlugin;
  state: ViewerState;
  onPick(key: string | null): void;
  onMiss(): void;
  assetBaseUrl?: string;
  /** Show labels for every structure («Подписи» mode); otherwise only the selected one. */
  labelsAll: boolean;
  autoRotate: boolean;
  reducedMotion: boolean;
  resetNonce: number;
  stepCamera: Camera | null;
}

interface AnchorInfo {
  position: THREE.Vector3;
  radius: number;
}
type Anchors = Map<string, AnchorInfo>;

const DEFAULT_CAMERA: Camera = { position: [0, 1.5, 6], target: [0, 0, 0], fov: 45 };

export default function SceneViewer(props: SceneViewerProps): JSX.Element {
  const { topic, concepts, plugin, state, onPick, onMiss, assetBaseUrl, labelsAll, autoRotate, reducedMotion, resetNonce, stepCamera } = props;
  const cam = topic.scene.camera ?? DEFAULT_CAMERA;
  const maxDpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(Math.min(1.5, maxDpr));
  const anchors = useRef<Anchors>(new Map());
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const Plugin = plugin.Component;

  const labelKeys = useMemo(() => {
    const vis = state.visibility ?? {};
    const keys = labelsAll ? concepts.map((c) => c.key) : state.selectedConceptKey ? [state.selectedConceptKey] : [];
    return keys.filter((k) => vis[k] !== 'hidden');
  }, [labelsAll, concepts, state.selectedConceptKey, state.visibility]);

  return (
    <>
      <Canvas
        dpr={dpr}
        camera={{ position: cam.position, fov: cam.fov ?? 45, near: 0.05, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
        onPointerMissed={(e) => e.type === 'click' && onMiss()}
      >
        {/* W-26: lower the resolution when the frame rate drops. */}
        <PerformanceMonitor
          flipflops={4}
          onDecline={() => setDpr((d) => Math.max(0.6, +(d * 0.75).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, +(d * 1.2).toFixed(2)))}
          onFallback={() => setDpr(0.75)}
        />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.1} />
        <directionalLight position={[-5, -2, -4]} intensity={0.25} />
        {/* W-25: image-based lighting from procedural light formers (works offline, no HDR download). */}
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={2.2} position={[0, 5, -6]} scale={[12, 4, 1]} />
          <Lightformer intensity={1.2} position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
          <Lightformer intensity={0.8} position={[6, -1, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} color="#cfe0ff" />
          <Lightformer form="ring" intensity={1.5} position={[0, 6, 4]} scale={3} />
        </Environment>
        <Suspense fallback={null}>
          <Plugin topic={topic} concepts={concepts} state={state} onSelectConcept={onPick} assetBaseUrl={assetBaseUrl} />
          <Grounding />
        </Suspense>
        <AnchorIndex anchors={anchors} concepts={concepts} />
        <CameraRig
          anchors={anchors}
          selected={state.selectedConceptKey}
          initial={cam}
          resetKey={`${topic.key}:${resetNonce}`}
          stepCamera={stepCamera}
          instant={reducedMotion}
        />
        <LabelProjector anchors={anchors} labelEls={labelEls} keys={labelKeys} selected={state.selectedConceptKey} />
        <CaptureHandle />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping={!reducedMotion}
          autoRotate={autoRotate && !reducedMotion}
          autoRotateSpeed={0.6}
          minDistance={0.8}
          maxDistance={30}
        />
      </Canvas>
      <div className="viewer__labels" aria-hidden="true">
        {labelKeys.map((k) => {
          const c = concepts.find((x) => x.key === k);
          if (!c) return null;
          return (
            <span
              key={k}
              ref={(el) => {
                if (el) labelEls.current.set(k, el);
                else labelEls.current.delete(k);
              }}
              className={`scene-label${k === state.selectedConceptKey ? ' is-selected' : ''}`}
              style={{ visibility: 'hidden', left: 0, top: 0 }}
            >
              <span className="dot" style={{ background: `hsl(${c.hue} 70% 58%)` }} />
              {tr(c.title, state.lang)}
            </span>
          );
        })}
      </div>
    </>
  );
}

/**
 * W-22 fallback anchors: the centre of the FIRST instance of each concept
 * (topic `anchor` overrides win). Re-indexed periodically because assets load
 * asynchronously and modes can swap geometry.
 */
function AnchorIndex({ anchors, concepts }: { anchors: MutableRefObject<Anchors>; concepts: ResolvedConcept[] }): null {
  const scene = useThree((s) => s.scene);
  const frame = useRef(0);
  const box = useMemo(() => new THREE.Box3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    if (frame.current++ % 30 !== 0) return;
    const found: Anchors = new Map();
    scene.traverse((obj) => {
      const key = obj.userData?.[CONCEPT_KEY_USERDATA] as string | undefined;
      if (!key || found.has(key) || !obj.visible) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const inst = obj as THREE.InstancedMesh;
      box.copy(mesh.geometry.boundingBox!);
      if (inst.isInstancedMesh && inst.count > 0) {
        inst.getMatrixAt(0, m);
        box.applyMatrix4(m);
      }
      box.applyMatrix4(obj.matrixWorld);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      found.set(key, { position: sphere.center.clone(), radius: Math.max(0.05, sphere.radius) });
    });
    for (const c of concepts) {
      if (c.anchor) found.set(c.key, { position: new THREE.Vector3(...c.anchor), radius: found.get(c.key)?.radius ?? 0.4 });
    }
    anchors.current = found;
  });
  return null;
}

/** Contact shadow under the model (W-25), placed at the bottom of the content. */
function Grounding(): JSX.Element | null {
  const scene = useThree((s) => s.scene);
  const [ground, setGround] = useState<{ y: number; scale: number } | null>(null);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 45 !== 0 || frame.current > 400) return;
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (o.userData?.[CONCEPT_KEY_USERDATA] && (o as THREE.Mesh).geometry) box.expandByObject(o);
    });
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const next = { y: +(box.min.y - 0.05).toFixed(2), scale: +(Math.max(size.x, size.z) * 2.2 + 1).toFixed(1) };
    if (!ground || Math.abs(ground.y - next.y) > 0.02 || Math.abs(ground.scale - next.scale) > 0.1) setGround(next);
  });
  if (!ground) return null;
  return <ContactShadows position={[0, ground.y, 0]} scale={ground.scale} opacity={0.45} blur={2.4} far={Math.max(2, ground.scale / 2)} resolution={512} frames={Infinity} />;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** W-20: smooth camera flight to the selected structure, a tour step camera, or the topic view. */
function CameraRig(props: {
  anchors: MutableRefObject<Anchors>;
  selected: string | null;
  initial: Camera;
  resetKey: string;
  stepCamera: Camera | null;
  instant: boolean;
}): null {
  const { anchors, selected, initial, resetKey, stepCamera, instant } = props;
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const flight = useRef<{ fromP: THREE.Vector3; fromT: THREE.Vector3; toP: THREE.Vector3; toT: THREE.Vector3; t: number } | null>(null);
  const pendingFocus = useRef<string | null>(null);

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3) => {
    if (!controls) return;
    flight.current = { fromP: camera.position.clone(), fromT: controls.target.clone(), toP: pos, toT: target, t: instant ? 1 : 0 };
  };

  // Cancel the flight when the user grabs the model.
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      flight.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useEffect(() => {
    if (!controls) return;
    flyTo(new THREE.Vector3(...initial.position), new THREE.Vector3(...initial.target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, controls]);

  useEffect(() => {
    if (stepCamera && controls) flyTo(new THREE.Vector3(...stepCamera.position), new THREE.Vector3(...stepCamera.target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepCamera, controls]);

  useEffect(() => {
    pendingFocus.current = selected;
  }, [selected]);

  useFrame((_, dt) => {
    if (!controls) return;
    const key = pendingFocus.current;
    if (key) {
      const a = anchors.current.get(key);
      if (a) {
        pendingFocus.current = null;
        const dir = camera.position.clone().sub(controls.target).normalize();
        if (dir.lengthSq() === 0) dir.set(0, 0.3, 1).normalize();
        const dist = THREE.MathUtils.clamp(a.radius * 4.5, 1.6, 9);
        flyTo(a.position.clone().add(dir.multiplyScalar(dist)), a.position.clone());
      }
    }
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / 0.9);
    const k = easeInOut(f.t);
    camera.position.lerpVectors(f.fromP, f.toP, k);
    controls.target.lerpVectors(f.fromT, f.toT, k);
    controls.update();
    if (f.t >= 1) flight.current = null;
  });
  return null;
}

/** Projects anchors to the screen and positions DOM labels without overlaps (W-22). */
function LabelProjector(props: {
  anchors: MutableRefObject<Anchors>;
  labelEls: MutableRefObject<Map<string, HTMLSpanElement>>;
  keys: string[];
  selected: string | null;
}): null {
  const { anchors, labelEls, keys, selected } = props;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const v = useMemo(() => new THREE.Vector3(), []);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 2 !== 0) return;
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    const inputs = keys.map((key) => {
      const a = anchors.current.get(key);
      const el = labelEls.current.get(key);
      if (!a || !el) return { key, x: 0, y: 0, width: 0, height: 0, hidden: true };
      v.copy(a.position).project(camera);
      return {
        key,
        x: ((v.x + 1) / 2) * w,
        y: ((1 - v.y) / 2) * h,
        width: el.offsetWidth,
        height: el.offsetHeight,
        hidden: v.z > 1 || v.z < -1,
        priority: key === selected ? 100 : -v.z,
      };
    });
    for (const p of placeLabels(inputs, { width: w, height: h })) {
      const el = labelEls.current.get(p.key);
      if (!el) continue;
      el.style.visibility = p.visible ? 'visible' : 'hidden';
      el.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top)}px)`;
    }
  });
  return null;
}

/** Registers the snapshot handle (W-51): renders a fresh frame and reads the canvas. */
function CaptureHandle(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    sceneHandle.set({
      capture() {
        try {
          gl.render(scene, camera);
          const webp = gl.domElement.toDataURL('image/webp', 0.86);
          return webp.startsWith('data:image/webp') ? webp : gl.domElement.toDataURL('image/png');
        } catch {
          return null;
        }
      },
      camera() {
        const p = camera.position.toArray() as Vec3;
        const t = (controls?.target.toArray() ?? [0, 0, 0]) as Vec3;
        return { position: p, target: t, fov: (camera as THREE.PerspectiveCamera).fov };
      },
    });
    return () => sceneHandle.set(null);
  }, [gl, scene, camera, controls]);
  return null;
}
