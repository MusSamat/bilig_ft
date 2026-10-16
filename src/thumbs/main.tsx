/**
 * DEV TOOL: the specimen-thumbnail renderer behind bilig_back's
 * `scripts/assets/thumbs.mjs`. Served by the Vite dev server at /thumb.html,
 * never part of the production build (only index.html is a build input).
 *
 * The script puts a spec on `window.__THUMB__` before the page loads; the
 * page draws that scene with the real viewer and plugins (so a thumbnail
 * looks exactly like the model in the app) and exposes
 * `window.__thumbCapture()` → a transparent WebP/PNG data URL.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { topicConcepts, type Camera, type ContentPackage, type Topic } from '@bilig/content-model';
import { applyModes, defaultModeState, registry, type ConceptVisibility, type ModeState, type ViewerState } from '@bilig/scene-core';
import { ensurePlugins, usePluginsReady } from '../scene/registry';
import { sceneHandle } from '../state/viewer';

const SceneViewer = lazy(() => import('../scene/SceneViewer'));

export interface ThumbSpec {
  pkg: ContentPackage;
  /** Replaces parts of `pkg.topic.scene` (another plugin, params, camera, asset). */
  scene?: Partial<Topic['scene']>;
  modes?: ModeState;
  focus?: string | null;
  isolate?: string[];
  hide?: string[];
  /** Freeze a process at this point (0..1 of the whole run; `time` = model seconds for continuous engines): e.g. the Moon at full moon. */
  process?: { key: string; fraction: number; time?: number };
  /** Where the scene's GLB is served (the script's static server); absent = procedural fallback. */
  assetBaseUrl?: string;
  lang?: 'ky' | 'ru' | 'en';
}

declare global {
  interface Window {
    __THUMB__?: ThumbSpec;
    __thumbCapture?: () => string | null;
    __thumbError?: string;
  }
}

function visibilityOf(spec: ThumbSpec, keys: string[]): Record<string, ConceptVisibility> | undefined {
  if (spec.isolate?.length) return Object.fromEntries(keys.filter((k) => !spec.isolate!.includes(k)).map((k) => [k, 'hidden' as const]));
  if (spec.hide?.length) return Object.fromEntries(spec.hide.map((k) => [k, 'hidden' as const]));
  return undefined;
}

function processView(spec: ThumbSpec): ViewerState['process'] {
  if (!spec.process) return undefined;
  const def = spec.pkg.processes.find((p) => p.key === spec.process!.key);
  if (!def) return undefined;
  const f = Math.min(1, Math.max(0, spec.process.fraction));
  const n = Math.max(1, def.steps.length);
  const stepIndex = Math.min(n - 1, Math.floor(f * n));
  return { key: def.key, stepIndex, percent: Math.round(f * 100), playing: false, speed: 1 as never, time: spec.process.time ?? f, stepFraction: f * n - stepIndex, fraction: f };
}

function ThumbScene({ spec }: { spec: ThumbSpec }) {
  const ready = usePluginsReady((s) => s.ready);
  const topic = useMemo<Topic>(() => ({ ...spec.pkg.topic, scene: { ...spec.pkg.topic.scene, ...spec.scene } as Topic['scene'] }), [spec]);
  const concepts = useMemo(() => topicConcepts(spec.pkg), [spec]);
  const plugin = ready ? registry.get(topic.scene.plugin) : undefined;
  if (!plugin) return null;
  const defs = registry.modesFor(topic.scene);
  const modes = applyModes(defaultModeState(defs), defs, { ...spec.modes, rotate: false });
  const state: ViewerState = {
    lang: spec.lang ?? 'en',
    selectedConceptKey: spec.focus ?? null,
    modes,
    visibility: visibilityOf(spec, concepts.map((c) => c.key)),
    reducedMotion: true,
    process: processView(spec),
  };
  return (
    <Suspense fallback={null}>
      <SceneViewer
        topic={topic}
        concepts={concepts}
        plugin={plugin}
        state={state}
        onPick={() => undefined}
        onMiss={() => undefined}
        assetBaseUrl={spec.assetBaseUrl}
        labelsAll={false}
        autoRotate={false}
        reducedMotion
        resetNonce={0}
        stepCamera={(spec.scene?.camera as Camera | undefined) ?? null}
        hue={spec.pkg.subject.hue}
      />
    </Suspense>
  );
}

function App() {
  const [spec] = useState(() => window.__THUMB__);
  useEffect(() => {
    void ensurePlugins();
    window.__thumbCapture = () => sceneHandle.get()?.capture() ?? null;
  }, []);
  if (!spec) return <p>window.__THUMB__ is not set</p>;
  return <ThumbScene spec={spec} />;
}

window.addEventListener('error', (e) => (window.__thumbError = String(e.message)));
createRoot(document.getElementById('root')!).render(<App />);
