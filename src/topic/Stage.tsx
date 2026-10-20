/**
 * The 3D stage (W-20…W-26), Workbench layout: a big rounded panel whose size
 * is reserved before three.js arrives (no layout shift); the structure chips
 * (the accessible tree) overlaid top-left, the «Вид модели» card top-right,
 * labels, the current process step caption, the control hint and the floating
 * toolbar («Выделить», «Скрыть остальное», «Сброс», «Снимок»; focus-only
 * commands explain why they are disabled). A first-visit coach explains the
 * controls. WebGL-unavailable fallback shows the specimen picture.
 */
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { conceptColor, player, registry, type ViewerState } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { useCoarsePointer, useFocusTrap, useKeydown, useLang, useReducedMotion } from '../lib/hooks';
import { hasLiveThumb, storeLiveThumb } from '../lib/thumbs';
import { useWebGLSupport } from '../scene/webgl';
import { effectiveVisibility, sceneHandle, useViewer } from '../state/viewer';
import { takeSnapshot } from './actions';
import { ConceptCard } from './ConceptCard';
import { fileUrl, useTopic } from './context';
import { ModePanel } from './ModePanel';
import { stageScene } from './stageSample';
import { StructureTree } from './StructureTree';
import { collapseStage, fullscreenSupported, onFullscreenChange, resetStageView, toggleFullscreen, toggleStage, useStageView } from './stageView';

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

const COACH_KEY = 'bilig.coach';
const coachSeen = (): boolean => {
  try {
    return localStorage.getItem(COACH_KEY) === '1';
  } catch {
    return true;
  }
};

function StageLoading(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="stage__loading" role="status">
      <span className="stage__pulse" aria-hidden="true" />
      <span>{t('scene.loading')}</span>
    </div>
  );
}

/** «How to use» overlay on the first visit (remembered per browser). */
function Coach({ touch, onClose }: { touch: boolean; onClose(): void }): JSX.Element {
  const { t } = useTranslation();
  const items: [string, string][] = touch
    ? [
        ['coach', t('scene.coach.rotateTouch')],
        ['search', t('scene.coach.zoomTouch')],
        ['pointer', t('scene.coach.selectTouch')],
      ]
    : [
        ['coach', t('scene.coach.rotate')],
        ['wheel', t('scene.coach.zoom')],
        ['pointer', t('scene.coach.select')],
      ];
  return (
    <div className="coach glass" role="region" aria-labelledby="coach-title">
      <h3 id="coach-title">
        <Icon name="spark" />
        {t('scene.coach.title')}
      </h3>
      <ul>
        {items.map(([icon, text]) => (
          <li key={icon}>
            <span className="coach__ic">
              <Icon name={icon} />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <button type="button" className="cta" onClick={onClose}>
        <Icon name="check" className="sm" />
        {t('scene.coach.ok')}
      </button>
    </div>
  );
}

/** Current process step, shown large near the model (its structure glows in 3D). */
function StepCaption(): JSX.Element | null {
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const proc = useViewer((s) => s.process);
  if (!proc) return null;
  const view = player.playerView(proc.state);
  if (!view.playing && view.fraction <= 0) return null;
  const def = pkg.processes.find((p) => p.key === proc.key);
  const step = def?.steps[view.stepIndex];
  if (!def || !step) return null;
  const c = step.conceptKey ? concepts.find((x) => x.key === step.conceptKey) : undefined;
  return (
    <div className="stepcap glass">
      <span className="stepcap__n" aria-hidden="true">
        {view.stepIndex + 1}
      </span>
      <div>
        <b>
          {tr(step.title, lang)}
          {c && (
            <span className="stepcap__c">
              <i className="dot sm" style={{ background: conceptColor(c.hue) }} />
              {tr(c.title, lang)}
            </span>
          )}
        </b>
        <p>{tr(step.description, lang)}</p>
      </div>
    </div>
  );
}

/** Asset attribution (CC BY and friends): an «i» button with a small popover. */
function Credits(): JSX.Element | null {
  const { t } = useTranslation();
  const { pkg } = useTopic();
  const [open, setOpen] = useState(false);
  const rights = pkg.topic.rights ?? [];
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!rights.length) return null;
  return (
    <div className="credits">
      <button type="button" className="ibtn glass credits__btn" aria-expanded={open} aria-controls="credits-pop" aria-label={t('scene.credits')} title={t('scene.credits')} onClick={() => setOpen((v) => !v)}>
        <Icon name="info" />
      </button>
      {open && (
        <div id="credits-pop" className="credits__pop glass" role="region" aria-label={t('scene.credits')}>
          <h3>{t('scene.credits')}</h3>
          <ul>
            {rights.map((r, i) => (
              <li key={i}>
                {r.covers && <b>{r.covers}</b>}
                <span>
                  {t('scene.license')}: {r.license}
                </span>
                <span>
                  {t('scene.author')}: {r.author}
                </span>
                <span>
                  {t('scene.source')}:{' '}
                  {/^https?:\/\//.test(r.source) ? (
                    <a href={r.source} target="_blank" rel="noreferrer noopener">
                      {r.source.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    r.source
                  )}
                </span>
                {r.notes && <small>{r.notes}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ToolProps {
  id: string;
  icon: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Why the tool is disabled (tooltip + aria-describedby). */
  reasonId?: string;
  reason?: string;
  onClick(): void;
}

function Tool(p: ToolProps): JSX.Element {
  return (
    <span className="tip" data-tip={p.disabled ? p.reason : undefined}>
      <button
        type="button"
        className="tb"
        data-tool={p.id}
        aria-pressed={p.pressed}
        disabled={p.disabled}
        onClick={p.onClick}
        aria-label={p.label}
        aria-describedby={p.disabled ? p.reasonId : undefined}
      >
        <Icon name={p.icon} />
        <span>{p.label}</span>
      </button>
    </span>
  );
}

export function Stage({ ready }: { ready: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts, filesBaseUrl, lesson } = useTopic();
  const reducedMotion = useReducedMotion();
  const touch = useCoarsePointer();
  const v = useViewer();
  // v0.5.0: the stage renders the selected sample's scene (params merged, camera); the canvas stays mounted.
  const scene = useMemo(() => stageScene(pkg.topic, v.sample), [pkg.topic, v.sample]);
  const stageTopic = useMemo(() => (scene === pkg.topic.scene ? pkg.topic : { ...pkg.topic, scene }), [pkg.topic, scene]);
  const plugin = ready ? registry.get(scene.plugin) : undefined;
  // null while the (off-main-thread) probe runs: the stage shows its loader meanwhile.
  const webgl = useWebGLSupport();
  const [coach, setCoach] = useState(() => !coachSeen());
  const sectionRef = useRef<HTMLElement>(null);
  const expanded = useStageView((s) => s.expanded);
  const fullscreen = useStageView((s) => s.fullscreen);
  const drawer = useStageView((s) => s.drawer);
  const canFullscreen = useMemo(fullscreenSupported, []);

  // Focus view (~94% modal, optionally browser fullscreen): the same element, so the
  // canvas, camera, focus and process step are untouched.
  useFocusTrap(sectionRef, expanded, '.chat-fab, .chat-dock:not([hidden])');
  useEffect(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      resetStageView();
    };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    useStageView.setState({ drawer: !!useViewer.getState().selected || lesson });
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    sectionRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Popovers inside the view and the assistant close first.
      if (document.getElementById('credits-pop') || (e.target as Element | null)?.closest?.('.chat-dock')) return;
      collapseStage();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded, lesson]);
  // A picked part opens the concept drawer.
  useEffect(() => {
    if (expanded && v.selected) useStageView.setState({ drawer: true });
  }, [expanded, v.selected]);
  // `F` toggles the focus view (physical key, so it works on the Cyrillic layout too).
  useKeydown((e) => {
    if (e.code !== 'KeyF' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    e.preventDefault();
    toggleStage();
  });

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

  // Specimen preview: capture the model once when the package has no rendered thumbnail.
  const thumb = pkg.topic.samples.find((s) => (s.topicKey ?? pkg.topic.key) === pkg.topic.key)?.thumb;
  const thumbRendered = !!thumb && pkg.manifest.files.some((f) => f.path === thumb && f.size > 0);
  useEffect(() => {
    if (!plugin || thumbRendered || hasLiveThumb(pkg.topic.key)) return;
    const id = setTimeout(() => {
      // Only the topic scene stands for the topic's preview.
      if (useViewer.getState().sample) return;
      const frame = sceneHandle.get()?.capture();
      if (frame) void storeLiveThumb(pkg.topic.key, frame);
    }, 3000);
    return () => clearTimeout(id);
  }, [plugin, thumbRendered, pkg.topic.key]);

  const processDef = v.process ? pkg.processes.find((p) => p.key === v.process!.key) : undefined;
  const stepIndex = v.process ? player.currentStep(v.process.state) : -1;
  const procView = v.process ? player.playerView(v.process.state) : undefined;
  const stepActive = !!procView && (procView.playing || procView.fraction > 0);
  const state: ViewerState = {
    lang,
    selectedConceptKey: v.selected,
    hoveredConceptKey: v.hovered,
    modes: v.modes,
    visibility: effectiveVisibility(v),
    process: v.process && procView ? { key: v.process.key, ...procView } : undefined,
    highlightConceptKey: stepActive ? processDef?.steps[stepIndex]?.conceptKey ?? null : null,
    citedConceptKeys: v.cited,
    reducedMotion,
  };

  // Build-time assets may not exist yet (placeholder hashes, size 0): don't let
  // the plugin fetch them — it renders its procedural scene instead (W-25/W-26).
  const asset = pkg.topic.scene.asset;
  const assetReady = !!asset && pkg.manifest.files.some((f) => f.path === asset && f.size > 0);
  const alt = t('scene.alt', { title: tr(pkg.topic.title, lang), count: concepts.length });
  const closeCoach = () => {
    setCoach(false);
    try {
      localStorage.setItem(COACH_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const fallback = (message: string) => (
    <section className="stage stage--fallback" aria-label={t('scene.region')}>
      <div className="stage__fallback" role="img" aria-label={alt}>
        <Thumb src={thumb && thumbRendered ? fileUrl(filesBaseUrl, thumb) : undefined} alt={alt} hue={pkg.subject.hue} icon={pkg.subject.icon} />
        <div className="state">
          <Icon name="info" />
          <span>{message}</span>
        </div>
      </div>
      <StructureTree />
    </section>
  );

  if (webgl && !webgl.available) return fallback(t('scene.webglUnavailable'));
  if (ready && !plugin) return fallback(t('scene.pluginMissing'));

  const needsFocus = !v.selected;
  const focusReason = { reasonId: 'tb-needs-focus', reason: t('scene.needsFocus') };

  const cls = ['stage', v.findItemKey && 'is-finding', expanded && 'is-expanded', fullscreen && 'is-fs', expanded && drawer && 'has-drawer'].filter(Boolean).join(' ');
  return (
    <>
    {expanded && <div className="stage-backdrop" aria-hidden="true" onClick={collapseStage} />}
    <section
      ref={sectionRef}
      className={cls}
      aria-labelledby="stage-title"
      aria-describedby="scene-alt"
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      tabIndex={expanded ? -1 : undefined}
    >
      <h2 id="stage-title" className="visually-hidden">
        {t('scene.region')}
      </h2>
      <p id="scene-alt" className="visually-hidden">
        {alt}
      </p>
      <div className="stage__gl">
        {plugin && webgl ? (
          <SceneBoundary
            fallback={
              <div className="stage__loading" role="alert">
                <Icon name="info" />
                <span>{t('scene.webglUnavailable')}</span>
              </div>
            }
          >
            <Suspense fallback={<StageLoading />}>
              <SceneViewer
                topic={stageTopic}
                concepts={concepts}
                plugin={plugin}
                state={state}
                onPick={v.pick}
                onHover={v.setHovered}
                onMiss={() => !v.findItemKey && v.select(null)}
                assetBaseUrl={assetReady ? filesBaseUrl : undefined}
                labelsAll={!!v.modes.labels}
                autoRotate={!!v.modes.rotate && !lesson && !coach}
                reducedMotion={reducedMotion}
                resetNonce={v.resetNonce}
                stepCamera={v.stepCamera}
                stageSample={v.sample}
                sampleCamera={v.sampleCamera}
                hue={pkg.subject.hue}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          <StageLoading />
        )}
      </div>
      <StructureTree />
      {ready && <ModePanel ready={ready} />}
      {v.findItemKey && (
        <div className="find-banner" role="status">
          <Icon name="focus" className="sm" />
          {t('scene.findMode')}
        </div>
      )}
      <StepCaption />
      <p className="hint">{touch ? t('scene.hintTouch') : t('scene.hint')}</p>
      <div className="toolbar glass" role="toolbar" aria-label={t('scene.toolbar')}>
        <Tool id="isolate" icon="focus" label={t('scene.isolate')} pressed={v.toolbar === 'isolate'} disabled={needsFocus} {...focusReason} onClick={v.isolate} />
        <Tool id="hide" icon="eyeoff" label={t('scene.hideOthers')} pressed={v.toolbar === 'hide'} disabled={needsFocus} {...focusReason} onClick={v.hideOthers} />
        <Tool id="reset" icon="reset" label={t('scene.reset')} onClick={v.resetView} />
        <Tool id="shot" icon="camera" label={t('scene.snapshot')} disabled={!plugin} reasonId="tb-loading" reason={t('scene.loading')} onClick={() => void takeSnapshot(pkg, lang)} />
        <span className="toolbar__sep" aria-hidden="true" />
        <Tool id="expand" icon={expanded ? 'shrink' : 'expand'} label={expanded ? t('scene.collapse') : t('scene.expand')} pressed={expanded} onClick={toggleStage} />
        {canFullscreen && <Tool id="fullscreen" icon={fullscreen ? 'fullscreenExit' : 'fullscreen'} label={fullscreen ? t('scene.fullscreenExit') : t('scene.fullscreen')} pressed={fullscreen} onClick={() => void toggleFullscreen()} />}
        <span id="tb-needs-focus" className="visually-hidden">
          {t('scene.needsFocus')}
        </span>
        <span id="tb-loading" className="visually-hidden">
          {t('scene.loading')}
        </span>
      </div>
      <Credits />
      {expanded &&
        (drawer ? (
          <aside className="stage__drawer" aria-label={t('scene.cardPanel')}>
            <div className="stage__drawer-bar">
              <span>{t('scene.cardPanel')}</span>
              <button type="button" className="ibtn" onClick={() => useStageView.setState({ drawer: false })} aria-label={t('scene.hideCard')} title={t('scene.hideCard')}>
                <Icon name="sidebar" />
              </button>
            </div>
            <ConceptCard ready={ready} />
          </aside>
        ) : (
          <button type="button" className="stage__drawer-tab glass" onClick={() => useStageView.setState({ drawer: true })}>
            <Icon name="sidebar" className="sm" />
            {t('scene.showCard')}
          </button>
        ))}
      {expanded && (
        <button type="button" className="ibtn glass stage__close" onClick={collapseStage} aria-label={t('scene.collapse')} title={t('scene.collapse')}>
          <Icon name="x" />
        </button>
      )}
      {coach && ready && <Coach touch={touch} onClose={closeCoach} />}
    </section>
    </>
  );
}
