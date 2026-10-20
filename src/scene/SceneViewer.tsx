/**
 * The shared 3D viewer core (TZ W-20..W-26) — identical for every plugin.
 * It owns the canvas, room-environment lighting with a hue rim light, the
 * contact shadow, orbit controls (mouse, touch, wheel, pinch), framing the
 * whole model, the camera flight to the selected structure, hover probing
 * (highlight + name), generous hit areas (a miss near a structure's anchor
 * still picks it), labels with leader lines placed without overlaps, adaptive
 * resolution (PerformanceMonitor) and snapshot capture. Plugins only draw
 * meshes tagged with `userData.conceptKey`. Loaded as a lazy chunk with three.js.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, PerformanceMonitor, useProgress } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { t as tr, type Camera, type ResolvedConcept, type Topic, type Vec3 } from '@bilig/content-model';
import { CONCEPT_KEY_USERDATA, conceptColor, pickConcept, placeLabels, type AssetStatus, type Hit, type ScenePlugin, type ViewerState } from '@bilig/scene-core';
import { CompileGate, SceneFx, useShadersCompiling } from '@bilig/scene-kit';
import { sceneHandle } from '../state/viewer';
import { isSoftwareGL, isSoftwareRenderer, reportRenderer } from './webgl';

export interface SceneViewerProps {
  topic: Topic;
  concepts: ResolvedConcept[];
  plugin: ScenePlugin;
  state: ViewerState;
  onPick(key: string | null): void;
  onHover?(key: string | null): void;
  onMiss(): void;
  assetBaseUrl?: string;
  /** Show labels for every structure («Подписи» mode); otherwise the selected / hovered / current-step one. */
  labelsAll: boolean;
  autoRotate: boolean;
  reducedMotion: boolean;
  resetNonce: number;
  stepCamera: Camera | null;
  /** v0.5.0: key of the sample on the stage (a change re-frames the view). */
  stageSample?: string | null;
  /** The stage sample's camera: the home view (exact) while the sample is shown. */
  sampleCamera?: Camera | null;
  /** Subject hue for the rim light. */
  hue?: number;
}

interface AnchorInfo {
  position: THREE.Vector3;
  radius: number;
}
type Anchors = Map<string, AnchorInfo>;
interface Bounds {
  center: THREE.Vector3;
  radius: number;
  /** Full extents of the box (the home view fits width and height separately). */
  size: THREE.Vector3;
}

/**
 * Centred over the stage: download progress of the model's files (GLB,
 * textures), then shader preparation; when the file cannot be loaded, a
 * message with «Retry».
 */
function ModelProgress({ status, onRetry }: { status: AssetStatus | null; onRetry(): void }): JSX.Element | null {
  const { t } = useTranslation();
  const { active, progress } = useProgress();
  const compiling = useShadersCompiling();
  const loading = active || status === 'loading';
  let card: JSX.Element;
  if (status === 'failed')
    card = (
      <div className="stage__progress stage__progress--failed" role="alertdialog" aria-labelledby="stage-load-failed">
        <span id="stage-load-failed">{t('scene.loadFailed')}</span>
        <button type="button" className="btn2" onClick={onRetry} autoFocus>
          {t('scene.retry')}
        </button>
      </div>
    );
  else if (loading) {
    const pct = Math.round(active ? progress : 0);
    card = (
      <div className="stage__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('scene.loading')}>
        <span className="stage__spinner" aria-hidden="true" />
        <span>{t('scene.loadingProgress', { percent: pct })}</span>
        <span className="stage__progress-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
    );
  } else if (compiling)
    card = (
      <div className="stage__progress" role="status">
        <span className="stage__spinner" aria-hidden="true" />
        <span>{t('scene.preparing')}</span>
      </div>
    );
  else return null;
  // A veil over the 3D area and its labels: nothing behind competes with the message.
  return <div className="stage__veil">{card}</div>;
}

const DEFAULT_CAMERA: Camera = { position: [0, 1.5, 6], target: [0, 0, 0], fov: 45 };
/** A click or hover this close (px) to a structure's anchor counts as that structure. */
const NEAR_PX = 26;

export default function SceneViewer(props: SceneViewerProps): JSX.Element {
  const { topic, concepts, plugin, state, onPick, onHover, onMiss, assetBaseUrl, labelsAll, autoRotate, reducedMotion, resetNonce, stepCamera, stageSample = null, sampleCamera = null, hue = 200 } = props;
  const cam = topic.scene.camera ?? DEFAULT_CAMERA;
  // The canvas camera is created once per topic; sample cameras are flown to by the rig.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const canvasCam = useMemo(() => ({ position: cam.position, fov: cam.fov ?? 45, near: 0.05, far: 200 }), [topic.key]);
  // From the worker probe; the real renderer corrects it in onCreated when the worker could not tell.
  const [lowPower, setLowPower] = useState(isSoftwareGL);
  const maxDpr = typeof window === 'undefined' ? 1 : lowPower ? 0.7 : Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(Math.min(1.5, maxDpr));
  const anchors = useRef<Anchors>(new Map());
  const bounds = useRef<Bounds | null>(null);
  const projected = useRef(new Map<string, { x: number; y: number }>());
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const leaderEls = useRef(new Map<string, SVGLineElement>());
  const Plugin = plugin.Component;
  const [assetStatus, setAssetStatus] = useState<AssetStatus | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  useEffect(() => setAssetStatus(null), [topic.key]);

  const focusKeys = useMemo(
    () => [...new Set([state.selectedConceptKey, state.highlightConceptKey, ...(state.citedConceptKeys ?? [])].filter((k): k is string => !!k))],
    [state.selectedConceptKey, state.highlightConceptKey, state.citedConceptKeys],
  );

  const labelKeys = useMemo(() => {
    const vis = state.visibility ?? {};
    const focus = [state.selectedConceptKey, state.highlightConceptKey, state.hoveredConceptKey].filter((k): k is string => !!k);
    const keys = labelsAll ? [...new Set([...focus, ...concepts.map((c) => c.key)])] : [...new Set(focus)];
    return keys.filter((k) => vis[k] !== 'hidden');
  }, [labelsAll, concepts, state.selectedConceptKey, state.highlightConceptKey, state.hoveredConceptKey, state.visibility]);

  const visRef = useRef(state.visibility);
  visRef.current = state.visibility;
  const nearest = useCallback((clientX: number, clientY: number, el: HTMLElement): string | null => {
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    let best: string | null = null;
    let bestD = NEAR_PX;
    for (const [k, p] of projected.current) {
      if ((visRef.current?.[k] ?? 'normal') === 'hidden') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }, []);

  return (
    <>
      <ModelProgress status={assetStatus} onRetry={() => setRetryNonce((n) => n + 1)} />
      <Canvas
        dpr={dpr}
        camera={canvasCam}
        gl={{ antialias: !lowPower, alpha: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        shadows={lowPower ? false : 'soft'}
        onCreated={({ gl }) => {
          const ctx = gl.getContext();
          const info = ctx.getExtension('WEBGL_debug_renderer_info');
          const name = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
          reportRenderer(name);
          if (isSoftwareRenderer(name)) {
            setLowPower(true);
            setDpr((d) => Math.min(d, 0.7));
          }
          gl.localClippingEnabled = true;
          // Khronos PBR Neutral: true-to-authored colours (the concept hues match the UI chips),
          // where ACES shifts saturated hues and greys out highlights.
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1;
          gl.setClearColor(0x000000, 0);
        }}
        onPointerMissed={(e) => {
          if (e.type !== 'click') return;
          const k = nearest(e.clientX, e.clientY, e.target as HTMLElement);
          if (k) onPick(k);
          else onMiss();
        }}
      >
        {/* W-26: lower the resolution when the frame rate drops. */}
        <PerformanceMonitor
          flipflops={4}
          onDecline={() => setDpr((d) => Math.max(0.5, +(d * 0.75).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, +(d * 1.2).toFixed(2)))}
          onFallback={() => setDpr(0.75)}
        />
        <RoomLighting hue={hue} bounds={bounds} shadows={!lowPower} />
        <SceneFx focus={focusKeys} hover={state.hoveredConceptKey ?? null} shadows={!lowPower} />
        <Suspense fallback={null}>
          <CompileGate>
            <Plugin topic={topic} concepts={concepts} state={state} onSelectConcept={onPick} assetBaseUrl={assetBaseUrl} onAssetStatus={setAssetStatus} retryNonce={retryNonce} />
          </CompileGate>
          <Grounding />
        </Suspense>
        <AnchorIndex anchors={anchors} bounds={bounds} concepts={concepts} />
        <CameraRig
          anchors={anchors}
          bounds={bounds}
          selected={state.selectedConceptKey}
          initial={cam}
          home={sampleCamera}
          resetKey={`${topic.key}:${stageSample ?? ''}:${resetNonce}`}
          stepCamera={stepCamera}
          instant={reducedMotion}
        />
        <HoverProbe concepts={concepts} onHover={onHover} nearest={nearest} />
        <LabelProjector anchors={anchors} projected={projected} labelEls={labelEls} leaderEls={leaderEls} keys={labelKeys} selected={state.selectedConceptKey} />
        <CaptureHandle />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping={!reducedMotion}
          dampingFactor={0.08}
          autoRotate={autoRotate && !reducedMotion}
          autoRotateSpeed={0.8}
          minDistance={0.8}
          maxDistance={40}
        />
      </Canvas>
      <div className="labs" aria-hidden="true">
        <svg className="labs__leaders">
          {labelKeys.map((k) => (
            <line
              key={k}
              ref={(el) => {
                if (el) leaderEls.current.set(k, el);
                else leaderEls.current.delete(k);
              }}
              style={{ visibility: 'hidden' }}
            />
          ))}
        </svg>
        {labelKeys.map((k) => {
          const c = concepts.find((x) => x.key === k);
          if (!c) return null;
          const on = k === state.selectedConceptKey || k === state.highlightConceptKey;
          return (
            <span
              key={k}
              ref={(el) => {
                if (el) labelEls.current.set(k, el);
                else labelEls.current.delete(k);
              }}
              className={`lab${on ? ' on' : ''}${k === state.hoveredConceptKey && !on ? ' hov' : ''}`}
              style={{ visibility: 'hidden' }}
            >
              <i className="dot sm" style={{ background: conceptColor(c.hue) }} />
              {tr(c.title, state.lang)}
            </span>
          );
        })}
      </div>
    </>
  );
}

/**
 * Studio lighting: a PMREM room environment for reflections, a soft
 * hemisphere fill, a key light that casts soft shadows (its shadow camera is
 * fitted to the model, so molecules and landscapes get equally crisp shadows)
 * and a rim light in the subject hue that separates the model from the stage.
 */
function RoomLighting({ hue, bounds, shadows }: { hue: number; bounds: MutableRefObject<Bounds | null>; shadows: boolean }): JSX.Element {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const key = useRef<THREE.DirectionalLight>(null);
  const fitted = useRef('');
  useEffect(() => {
    let tex: THREE.Texture | null = null;
    try {
      const pm = new THREE.PMREMGenerator(gl);
      tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      scene.environment = tex;
    } catch {
      /* lights alone still render */
    }
    return () => {
      if (scene.environment === tex) scene.environment = null;
      tex?.dispose();
    };
  }, [gl, scene]);
  // Key light and its shadow camera follow the model bounds (assets load late).
  useFrame(() => {
    const l = key.current;
    const b = bounds.current;
    if (!l || !b) return;
    const sig = `${b.center.x.toFixed(2)},${b.center.y.toFixed(2)},${b.center.z.toFixed(2)},${b.radius.toFixed(2)}`;
    if (sig === fitted.current) return;
    fitted.current = sig;
    const r = b.radius * 1.25;
    l.position.copy(b.center).add(new THREE.Vector3(0.45, 0.78, 0.55).normalize().multiplyScalar(r * 3));
    l.target.position.copy(b.center);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = r * 0.5;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
    l.shadow.normalBias = b.radius * 0.012;
    l.shadow.needsUpdate = true;
  });
  const rim = useMemo(() => new THREE.Color().setHSL(hue / 360, 0.7, 0.6), [hue]);
  return (
    <>
      <hemisphereLight args={[0xffffff, 0x8fa0b8, 0.5]} />
      <directionalLight
        ref={key}
        position={[4, 7, 6]}
        intensity={1.35}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-radius={4}
      >
        <object3D attach="target" />
      </directionalLight>
      <directionalLight position={[-5, 2, 4]} intensity={0.35} />
      <pointLight position={[-6, 3, -5]} color={rim} intensity={0.9} decay={0} />
    </>
  );
}

/**
 * W-22 fallback anchors: the centre of the FIRST instance of each concept
 * (topic `anchor` overrides win), plus the bounds of the whole model for
 * framing. Re-indexed periodically because assets load asynchronously and
 * modes can swap geometry.
 */
function AnchorIndex({ anchors, bounds, concepts }: { anchors: MutableRefObject<Anchors>; bounds: MutableRefObject<Bounds | null>; concepts: ResolvedConcept[] }): null {
  const scene = useThree((s) => s.scene);
  const frame = useRef(0);
  const box = useMemo(() => new THREE.Box3(), []);
  const all = useMemo(() => new THREE.Box3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    if (frame.current++ % 30 !== 0) return;
    // Meshes created this frame still have identity world matrices until the first render: the first
    // pass would measure every part at the origin and the home view would frame the wrong box.
    scene.updateMatrixWorld();
    const found: Anchors = new Map();
    all.makeEmpty();
    scene.traverse((obj) => {
      const key = obj.userData?.[CONCEPT_KEY_USERDATA] as string | undefined;
      if (!key || !obj.visible) return;
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
      if (inst.isInstancedMesh && inst.count > 0) {
        // All instances, as a box (a bounding sphere would turn a long row of particles into a tall cube).
        if (!inst.boundingBox) inst.computeBoundingBox();
        all.union(inst.boundingBox!.clone().applyMatrix4(obj.matrixWorld));
      } else all.union(box);
      if (found.has(key)) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      found.set(key, { position: sphere.center.clone(), radius: Math.max(0.05, sphere.radius) });
    });
    // Content anchors are for the generic stand-in / GLBs; a model that places its own structures
    // (the procedural cells) marks itself with userData.ownAnchors and keeps mesh-derived anchors.
    let own = false;
    scene.traverse((o) => {
      if (o.userData?.ownAnchors) own = true;
    });
    if (!own) {
      for (const c of concepts) {
        if (c.anchor) found.set(c.key, { position: new THREE.Vector3(...c.anchor), radius: found.get(c.key)?.radius ?? 0.4 });
      }
    }
    anchors.current = found;
    if (!all.isEmpty()) {
      // Framing radius from the box half-extents (a sphere around the box overestimates by up to √3).
      const size = all.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) / 2;
      bounds.current = { center: all.getCenter(new THREE.Vector3()), radius: Math.max(0.3, radius), size };
    }
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
    const next = { y: +(box.min.y - 0.3).toFixed(2), scale: +(Math.max(size.x, size.z) * 1.6 + 1).toFixed(1) };
    if (!ground || Math.abs(ground.y - next.y) > 0.02 || Math.abs(ground.scale - next.scale) > 0.1) setGround(next);
  });
  if (!ground) return null;
  return <ContactShadows position={[0, ground.y, 0]} scale={ground.scale} opacity={0.38} blur={2.6} far={Math.max(2, ground.scale / 2)} resolution={256} frames={1} key={`${ground.y}:${ground.scale}`} />;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * W-20: frame the whole model (keeping the topic camera's direction), fly to
 * the selected structure, to a tour step camera, or back to the framed view —
 * or, while a stage sample with a camera is shown, to that exact camera.
 */
function CameraRig(props: {
  anchors: MutableRefObject<Anchors>;
  bounds: MutableRefObject<Bounds | null>;
  selected: string | null;
  initial: Camera;
  /** Exact home pose (a stage sample's camera) instead of framing the bounds. */
  home?: Camera | null;
  resetKey: string;
  stepCamera: Camera | null;
  instant: boolean;
}): null {
  const { anchors, bounds, selected, initial, home, resetKey, stepCamera, instant } = props;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const flight = useRef<{ fromP: THREE.Vector3; fromT: THREE.Vector3; toP: THREE.Vector3; toT: THREE.Vector3; t: number } | null>(null);
  /** What the camera currently shows: a structure key, 'home', or nothing yet. */
  const shown = useRef<string | null>(null);
  const homeFor = useRef<string | null>(null);
  const stepFor = useRef<Camera | null>(null);
  /** The bounds the home view was framed on, when, and whether the user has moved the camera since. */
  const homeFrom = useRef<{ bounds: Bounds; at: number } | null>(null);
  const grabbed = useRef(false);

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, now = instant) => {
    if (!controls) return;
    flight.current = { fromP: camera.position.clone(), fromT: controls.target.clone(), toP: pos, toT: target, t: now ? 1 : 0 };
  };

  /**
   * Camera pose that fits the model bounds in the viewport, from the topic camera direction. Width and
   * height are fitted separately (the box projected on the view's right / up axes), so a wide scene —
   * a road, a track, a wave — fills the wide stage instead of a third of it.
   */
  const homePose = (): { pos: THREE.Vector3; target: THREE.Vector3 } | null => {
    if (home) return { pos: new THREE.Vector3(...home.position), target: new THREE.Vector3(...home.target) };
    const b = bounds.current;
    if (!b) return null;
    const dir = new THREE.Vector3(...initial.position).sub(new THREE.Vector3(...initial.target));
    if (dir.lengthSq() === 0) dir.set(0.55, 0.32, 1);
    dir.normalize();
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = size.width / Math.max(1, size.height);
    const tanV = Math.tan(vfov / 2);
    const tanH = tanV * aspect;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    // Half extents of the box seen from `dir`, and its half depth (nearer corners need more room).
    const h = b.size.clone().multiplyScalar(0.5);
    const proj = (axis: THREE.Vector3) => h.x * Math.abs(axis.x) + h.y * Math.abs(axis.y) + h.z * Math.abs(axis.z);
    // Margins: the concept chips (top) and the toolbar (bottom) cover more of the height than the width.
    const dist = Math.max((proj(right) * 1.15) / tanH, (proj(up) * 1.65) / tanV) + proj(dir);
    return { pos: b.center.clone().add(dir.multiplyScalar(Math.max(dist, b.radius * 1.2))), target: b.center.clone() };
  };

  // Cancel the flight when the user grabs the model.
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      flight.current = null;
      grabbed.current = true;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  // Decided every frame from the latest props, so no transition is missed while assets load.
  useFrame((_, dt) => {
    if (!controls) return;
    if (stepCamera && stepFor.current !== stepCamera) {
      stepFor.current = stepCamera;
      shown.current = 'step';
      flyTo(new THREE.Vector3(...stepCamera.position), new THREE.Vector3(...stepCamera.target));
    } else if (!stepCamera) stepFor.current = null;

    const wantHome = homeFor.current !== resetKey;
    if (selected && shown.current !== selected && !stepCamera) {
      const a = anchors.current.get(selected);
      if (a && bounds.current) {
        const firstView = shown.current === null;
        shown.current = selected;
        homeFor.current = resetKey;
        const home = homePose();
        const dir = (firstView && home ? home.pos.clone().sub(home.target) : camera.position.clone().sub(controls.target)).normalize();
        if (dir.lengthSq() === 0) dir.set(0, 0.3, 1).normalize();
        const r = bounds.current.radius;
        const dist = THREE.MathUtils.clamp(a.radius * 3.6, r * 1.05, r * 2.2);
        flyTo(a.position.clone().add(dir.multiplyScalar(dist)), a.position.clone(), firstView || instant);
      }
    } else if (!selected && !stepCamera && (shown.current !== 'home' || wantHome)) {
      const pose = homePose();
      if (pose) {
        const firstView = shown.current === null;
        shown.current = 'home';
        homeFor.current = resetKey;
        if (bounds.current) homeFrom.current = { bounds: bounds.current, at: performance.now() };
        flyTo(pose.pos, pose.target, firstView || instant);
      }
    } else if (shown.current === 'home' && !home && !grabbed.current && homeFrom.current && bounds.current && bounds.current !== homeFrom.current.bounds) {
      // The scene is still settling (assets, the first frames of a sim): while the user hasn't touched the
      // camera, frame the new bounds if they changed noticeably during the first seconds.
      const a = homeFrom.current.bounds;
      const b = bounds.current;
      const moved = a.center.distanceTo(b.center) > 0.05 * a.radius || Math.abs(a.size.length() - b.size.length()) > 0.08 * a.size.length();
      if (performance.now() - homeFrom.current.at > 2500) homeFrom.current = null;
      else if (moved) {
        homeFrom.current = { bounds: b, at: homeFrom.current.at };
        const pose = homePose();
        if (pose) flyTo(pose.pos, pose.target, true);
      }
    } else if (selected && wantHome && shown.current === selected) {
      // «Reset» with a selection kept by the store: frame the whole model again.
      homeFor.current = resetKey;
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

/** Pointer hover: the structure under the cursor (or near its anchor) is highlighted and named. */
function HoverProbe({ concepts, onHover, nearest }: { concepts: ResolvedConcept[]; onHover?: (k: string | null) => void; nearest(x: number, y: number, el: HTMLElement): string | null }): null {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!onHover) return;
    const el = gl.domElement;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const set = (k: string | null) => {
      if (k === last.current) return;
      last.current = k;
      el.style.cursor = k ? 'pointer' : '';
      onHover(k);
    };
    const run = () => {
      raf = 0;
      if (!ev) return;
      if (ev.buttons) return set(null);
      const r = el.getBoundingClientRect();
      const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, camera);
      const hits: Hit[] = [];
      for (const i of ray.intersectObject(scene, true)) {
        let k: string | undefined;
        let visible = true;
        for (let o: THREE.Object3D | null = i.object; o; o = o.parent) {
          if (!o.visible) visible = false;
          k ??= o.userData?.[CONCEPT_KEY_USERDATA] as string | undefined;
        }
        if (k && visible) hits.push({ conceptKey: k, distance: i.distance });
      }
      set(pickConcept(hits, concepts) ?? nearest(ev.clientX, ev.clientY, el));
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      ev = e;
      if (!raf) raf = requestAnimationFrame(run);
    };
    const leave = () => {
      ev = null;
      set(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.style.cursor = '';
    };
  }, [gl, camera, scene, ray, concepts, onHover, nearest]);
  return null;
}

/** Projects anchors to the screen and positions DOM labels (with leader lines) without overlaps (W-22). */
function LabelProjector(props: {
  anchors: MutableRefObject<Anchors>;
  projected: MutableRefObject<Map<string, { x: number; y: number }>>;
  labelEls: MutableRefObject<Map<string, HTMLSpanElement>>;
  leaderEls: MutableRefObject<Map<string, SVGLineElement>>;
  keys: string[];
  selected: string | null;
}): null {
  const { anchors, projected, labelEls, leaderEls, keys, selected } = props;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const v = useMemo(() => new THREE.Vector3(), []);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 2 !== 0) return;
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    const proj = new Map<string, { x: number; y: number }>();
    for (const [k, a] of anchors.current) {
      v.copy(a.position).project(camera);
      if (v.z <= 1 && v.z >= -1) proj.set(k, { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h });
    }
    projected.current = proj;
    const inputs = keys.map((key) => {
      const p = proj.get(key);
      const el = labelEls.current.get(key);
      if (!p || !el) return { key, x: 0, y: 0, width: 0, height: 0, hidden: true };
      return { key, x: p.x, y: p.y, width: el.offsetWidth, height: el.offsetHeight, hidden: false, priority: key === selected ? 100 : 0 };
    });
    for (const p of placeLabels(inputs, { width: w, height: h }, { gap: 18 })) {
      const el = labelEls.current.get(p.key);
      const line = leaderEls.current.get(p.key);
      if (!el) continue;
      el.style.visibility = p.visible ? 'visible' : 'hidden';
      el.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top)}px)`;
      const a = proj.get(p.key);
      if (!line) continue;
      if (!p.visible || !a) {
        line.style.visibility = 'hidden';
        continue;
      }
      // Leader from the anchor to the nearest point of the label box.
      const bx = Math.min(Math.max(a.x, p.left), p.left + el.offsetWidth);
      const by = Math.min(Math.max(a.y, p.top), p.top + el.offsetHeight);
      line.setAttribute('x1', String(Math.round(a.x)));
      line.setAttribute('y1', String(Math.round(a.y)));
      line.setAttribute('x2', String(Math.round(bx)));
      line.setAttribute('y2', String(Math.round(by)));
      line.style.visibility = 'visible';
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
  const setFrameloop = useThree((s) => s.setFrameloop);
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
    // Dev/test hook: inspect the camera, or freeze rendering (visual regression tests).
    if (import.meta.env.DEV) (window as unknown as { __biligScene?: unknown }).__biligScene = { camera, controls, scene, setFrameloop };
    return () => sceneHandle.set(null);
  }, [gl, scene, camera, controls, setFrameloop]);
  return null;
}
