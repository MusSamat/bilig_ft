/**
 * The 3D stage (W-20…W-26): lazy viewer chunk, control hint, toolbar
 * («Выделить», «Скрыть остальное», «Сброс», «Снимок» — focus-only commands are
 * disabled without a selection), quiz «find on model» banner, and the
 * WebGL-unavailable fallback with the sample picture and an honest message.
 */
import { Component, Suspense, lazy, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { player, registry, type ViewerState } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { useCoarsePointer, useLang, useReducedMotion } from '../lib/hooks';
import { hasWebGL } from '../scene/webgl';
import { effectiveVisibility, useViewer } from '../state/viewer';
import { takeSnapshot } from './actions';
import { fileUrl, useTopic } from './context';

const SceneViewer = lazy(() => import('../scene/SceneViewer'));

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Stage({ ready }: { ready: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { pkg, concepts, filesBaseUrl, lesson } = useTopic();
  const reducedMotion = useReducedMotion();
  const touch = useCoarsePointer();
  const v = useViewer();
  const plugin = ready ? registry.get(pkg.topic.scene.plugin) : undefined;
  const webgl = useMemo(hasWebGL, []);

  // Drive the process player from requestAnimationFrame (W-41).
  const playing = !!v.process?.state.playing;
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      useViewer.getState().playerDispatch({ type: 'tick', dt: Math.min(0.1, (now - last) / 1000) });
      last = now;
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const processDef = v.process ? pkg.processes.find((p) => p.key === v.process!.key) : undefined;
  const stepIndex = v.process ? player.currentStep(v.process.state) : -1;
  const state: ViewerState = {
    lang,
    selectedConceptKey: v.selected,
    modes: v.modes,
    visibility: effectiveVisibility(v),
    process: v.process ? { key: v.process.key, ...player.playerView(v.process.state) } : undefined,
    highlightConceptKey: processDef?.steps[stepIndex]?.conceptKey ?? null,
    citedConceptKeys: v.cited,
    reducedMotion,
  };

  // Build-time assets may not exist yet (placeholder hashes, size 0): don't let
  // the plugin fetch them — it renders its procedural scene instead (W-25/W-26).
  const asset = pkg.topic.scene.asset;
  const assetReady = !!asset && pkg.manifest.files.some((f) => f.path === asset && f.size > 0);
  const thumb = pkg.topic.samples[0]?.thumb;
  const alt = t('scene.alt', { title: tr(pkg.topic.title, lang), count: concepts.length });
  const fallback = (message: string) => (
    <div className="viewer viewer--fallback" role="img" aria-label={alt}>
      <Thumb src={thumb ? fileUrl(filesBaseUrl, thumb) : undefined} alt={alt} hue={pkg.subject.hue} icon={pkg.subject.icon} />
      <p>{message}</p>
    </div>
  );

  if (!webgl) return fallback(t('scene.webglUnavailable'));
  if (ready && !plugin) return fallback(t('scene.pluginMissing'));

  return (
    <section className="viewer" aria-label={t('scene.region')} aria-describedby="scene-alt">
      <p id="scene-alt" className="visually-hidden">
        {alt}
      </p>
      {plugin ? (
        <SceneBoundary fallback={fallback(t('scene.webglUnavailable'))}>
          <Suspense fallback={<div className="viewer__loading">{t('scene.loading')}</div>}>
            <SceneViewer
              topic={pkg.topic}
              concepts={concepts}
              plugin={plugin}
              state={state}
              onPick={v.pick}
              onMiss={() => !v.findItemKey && v.select(null)}
              assetBaseUrl={assetReady ? filesBaseUrl : undefined}
              labelsAll={!!v.modes.labels}
              autoRotate={!!v.modes.rotate && !lesson}
              reducedMotion={reducedMotion}
              resetNonce={v.resetNonce}
              stepCamera={v.stepCamera}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        <div className="viewer__loading">{t('scene.loading')}</div>
      )}
      {v.findItemKey && (
        <div className="find-banner" role="status">
          {t('scene.findMode')}
        </div>
      )}
      <div className="viewer__hint">
        <span className="hint">{touch ? t('scene.hintTouch') : t('scene.hint')}</span>
        <div className="toolbar" role="toolbar" aria-label={t('scene.toolbar')}>
          <button type="button" className="icon-btn" aria-pressed={v.toolbar === 'isolate'} disabled={!v.selected} onClick={v.isolate} aria-label={t('scene.isolate')} title={v.selected ? t('scene.isolate') : t('scene.needsFocus')}>
            <Icon name="focus" />
          </button>
          <button type="button" className="icon-btn" aria-pressed={v.toolbar === 'hide'} disabled={!v.selected} onClick={v.hideOthers} aria-label={t('scene.hideOthers')} title={v.selected ? t('scene.hideOthers') : t('scene.needsFocus')}>
            <Icon name="eye-off" />
          </button>
          <button type="button" className="icon-btn" onClick={v.resetView} aria-label={t('scene.reset')} title={t('scene.reset')}>
            <Icon name="reset" />
          </button>
          <button type="button" className="icon-btn" disabled={!plugin} onClick={() => void takeSnapshot(pkg, lang, lesson, navigate)} aria-label={t('scene.snapshot')} title={t('scene.snapshot')}>
            <Icon name="camera" />
          </button>
        </div>
      </div>
    </section>
  );
}
