/**
 * The 3D stage (W-20…W-26). Its height is reserved before three.js arrives (no
 * layout shift) and sized so the whole stage fits the first screen under the
 * compact hero (audit P-1). Layers, on one overlay scale (tokens.css --z-*):
 *  - the structure chips (the accessible tree) along the top edge;
 *  - the current process step caption;
 *  - one toolbar at the bottom: «Көрүнүш» (the view modes, as a popover —
 *    audit P-3), «Бөлүп көрсөтүү» / «Калганын жашыруу» (only once a part is
 *    selected — audit P-4), reset, snapshot, sources, focus view, fullscreen;
 *  - a first-visit coach docked bottom-left (not over the model, hidden on the
 *    first drag, remembered — audit P-2);
 *  - in lesson mode the step bar along the bottom edge (LessonBar — audit L-1).
 * Popover state is remembered per device. WebGL-unavailable fallback shows the
 * specimen picture.
 */
import { Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { LessonBar } from './LessonPanel';
import { ModePanel, VIEW_MENU_ID } from './ModePanel';
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

export const COACH_KEY = 'bilig.coach';
export const VIEW_MENU_KEY = 'bilig.viewMenu';

const readFlag = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};
const writeFlag = (key: string, on: boolean): void => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* private mode: not remembered */
  }
};

/**
 * Height of the inline stage: what is left of the viewport under the header and
 * the hero (`--hero-h`, measured by TopicHero), within 360…880px. The lesson
 * bar is inside this height.
 */
const STAGE_H = 'h-[clamp(360px,calc(100dvh-var(--hdr-h,72px)-var(--hero-h,200px)-48px),880px)]';

function StageLoading(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="stage__loading" role="status">
      <span className="stage__pulse" aria-hidden="true" />
      <span>{t('scene.loading')}</span>
    </div>
  );
}

/**
 * «How to use» on the first visit: a slim strip docked just above the toolbar
 * (never over the middle of the model), closed by «Түшүнүктүү», × or the first drag.
 */
function Coach({ touch, onClose, className }: { touch: boolean; onClose(): void; className: string }): JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();
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
    <div
      className={`stage-coach glass flex items-center gap-x-4 gap-y-1 rounded-lg py-1.5 ps-3 pe-1.5 ${className}`}
      role="region"
      aria-labelledby={titleId}
    >
      <h3 id={titleId} className="visually-hidden">
        {t('scene.coach.title')}
      </h3>
      <ul className="m-0 flex min-w-0 list-none flex-wrap gap-x-4 gap-y-1 p-0 max-lg:flex-col">
        {items.map(([icon, text]) => (
          <li key={icon} className="flex items-center gap-1.5 text-sm font-medium">
            <Icon name={icon} className="sm shrink-0 text-accent" />
            {text}
          </li>
        ))}
      </ul>
      <button type="button" className="cta min-h-11 shrink-0 px-4 text-sm" onClick={onClose}>
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

const CREDITS_ID = 'credits-pop';

/** Asset attribution (CC BY and friends), opened from the toolbar's «i». */
function CreditsPopover({ onClose, className }: { onClose(): void; className: string }): JSX.Element {
  const { t } = useTranslation();
  const { pkg } = useTopic();
  return (
    <div id={CREDITS_ID} className={`glass grid gap-2 rounded-lg px-4 py-3 text-sm ${className}`} role="region" aria-labelledby="credits-title">
      <div className="flex items-center gap-2">
        <h3 id="credits-title" className="m-0 flex-1 text-sm font-bold">
          {t('scene.credits')}
        </h3>
        <button type="button" className="ibtn size-11" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
          <Icon name="x" className="sm" />
        </button>
      </div>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {(pkg.topic.rights ?? []).map((r, i) => (
          <li key={i} className="grid gap-0.5">
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
            {r.notes && <small className="text-muted">{r.notes}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ToolProps {
  id: string;
  icon: string;
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  disabled?: boolean;
  /** Why the tool is disabled (tooltip + aria-describedby). */
  reasonId?: string;
  reason?: string;
  /** Show the text label from this breakpoint up (icon only below; the name is always in aria-label). */
  labelFrom?: 'xl' | 'never';
  onClick(): void;
}

/** One stage tool: 44px square icon button, the label beside it on wide screens. */
function Tool(p: ToolProps): JSX.Element {
  const showLabel = p.labelFrom === 'never' ? 'sr-only' : 'max-xl:sr-only';
  return (
    <span className="tip shrink-0" data-tip={p.disabled ? p.reason : p.labelFrom === 'never' ? p.label : undefined}>
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-pill border-0 bg-transparent px-2.5 text-sm font-semibold text-ink transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:text-muted aria-pressed:bg-accent aria-pressed:text-on aria-expanded:bg-soft xl:px-3.5 [[data-mode=lesson]_&]:text-base"
        data-tool={p.id}
        aria-pressed={p.pressed}
        aria-expanded={p.expanded}
        aria-controls={p.controls}
        disabled={p.disabled}
        onClick={p.onClick}
        aria-label={p.label}
        aria-describedby={p.disabled ? p.reasonId : undefined}
        title={p.labelFrom === 'never' || p.disabled ? undefined : p.label}
      >
        <Icon name={p.icon} />
        <span className={showLabel}>{p.label}</span>
      </button>
    </span>
  );
}

type Popover = 'view' | 'credits' | null;

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
  const [coach, setCoach] = useState(() => !readFlag(COACH_KEY, false));
  const [pop, setPop] = useState<Popover>(() => (readFlag(VIEW_MENU_KEY, false) ? 'view' : null));
  const sectionRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
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
      if (document.getElementById(CREDITS_ID) || (e.target as Element | null)?.closest?.('.chat-dock')) return;
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

  // Esc closes an open popover and gives focus back to its toolbar button.
  const closePop = (focus = true) => {
    const was = pop;
    setPop(null);
    if (was === 'view') writeFlag(VIEW_MENU_KEY, false);
    if (focus && was) toolbarRef.current?.querySelector<HTMLElement>(`[data-tool="${was}"]`)?.focus();
  };
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const inside = (e.target as Element | null)?.closest?.(`#${VIEW_MENU_ID}, #${CREDITS_ID}, [data-tool="${pop}"]`);
      if (!inside && pop === 'view') return; // a remembered panel stays until closed from it
      e.preventDefault();
      closePop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop]);
  const togglePop = (which: Exclude<Popover, null>) => {
    const next = pop === which ? null : which;
    setPop(next);
    if (which === 'view' || pop === 'view') writeFlag(VIEW_MENU_KEY, next === 'view');
  };

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
    writeFlag(COACH_KEY, true);
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

  const selected = !!v.selected;
  const hasModes = ready && v.modeDefs.length > 0;
  const hasCredits = (pkg.topic.rights ?? []).length > 0;
  const withDrawer = expanded && drawer;
  // With the concept drawer open, the toolbar and popovers centre on the remaining model area.
  const besideDrawer = withDrawer ? 'md:right-(--drawer-w)' : '';
  const popPos = `absolute bottom-[72px] right-3 z-(--z-popover) max-h-[calc(100%-96px)] w-[min(300px,calc(100%-24px))] overflow-y-auto ${withDrawer ? 'md:right-[calc(var(--drawer-w)+12px)]' : ''}`;

  const cls = ['stage isolate flex flex-col', !expanded && `${STAGE_H} lg:sticky lg:top-[calc(var(--hdr-h,72px)+8px)]`, v.findItemKey && 'is-finding', expanded && 'is-expanded', fullscreen && 'is-fs', withDrawer && 'has-drawer']
    .filter(Boolean)
    .join(' ');
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
        data-testid="stage"
      >
        <h2 id="stage-title" className="visually-hidden">
          {t('scene.region')}
        </h2>
        <p id="scene-alt" className="visually-hidden">
          {alt} {touch ? t('scene.hintTouch') : t('scene.hint')}
        </p>
        <div className="stage__vp relative min-h-0 flex-1 max-md:[.is-expanded>&]:h-[62dvh] max-md:[.is-expanded>&]:flex-none">
          <div
            className="stage__gl"
            onPointerDown={() => {
              // The first drag on the model means the controls are understood.
              if (coach) closeCoach();
            }}
          >
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
          <StructureTree
            overlay
            className={expanded ? `max-md:pe-14 ${withDrawer ? 'md:right-[calc(var(--drawer-w)+12px)]' : 'md:pe-56'}` : ''}
          />
          {v.findItemKey && (
            <div className="find-banner" role="status">
              <Icon name="focus" className="sm" />
              {t('scene.findMode')}
            </div>
          )}
          <StepCaption />
          <div
            ref={toolbarRef}
            className={`glass absolute inset-x-0 bottom-3 z-(--z-toolbar) mx-auto flex w-max max-w-[calc(100%-24px)] items-center gap-1 rounded-pill p-1.5 max-md:overflow-x-auto max-md:[scrollbar-width:none] ${besideDrawer}`}
            role="toolbar"
            aria-label={t('scene.toolbar')}
          >
            {hasModes && <Tool id="view" icon="layers" label={t('scene.view')} expanded={pop === 'view'} controls={VIEW_MENU_ID} onClick={() => togglePop('view')} />}
            {selected && <Tool id="isolate" icon="focus" label={t('scene.isolate')} pressed={v.toolbar === 'isolate'} onClick={v.isolate} />}
            {selected && <Tool id="hide" icon="eyeoff" label={t('scene.hideOthers')} pressed={v.toolbar === 'hide'} onClick={v.hideOthers} />}
            <Tool id="reset" icon="reset" label={t('scene.reset')} onClick={v.resetView} />
            <Tool id="shot" icon="camera" label={t('scene.snapshot')} disabled={!plugin} reasonId="tb-loading" reason={t('scene.loading')} onClick={() => void takeSnapshot(pkg, lang)} />
            {hasCredits && <Tool id="credits" icon="info" label={t('scene.credits')} labelFrom="never" expanded={pop === 'credits'} controls={CREDITS_ID} onClick={() => togglePop('credits')} />}
            <span className="mx-0.5 w-px self-stretch bg-line" aria-hidden="true" />
            <Tool id="expand" icon={expanded ? 'shrink' : 'expand'} label={expanded ? t('scene.collapse') : t('scene.expand')} labelFrom={expanded ? 'never' : 'xl'} pressed={expanded} onClick={toggleStage} />
            {canFullscreen && (
              <Tool
                id="fullscreen"
                icon={fullscreen ? 'fullscreenExit' : 'fullscreen'}
                label={fullscreen ? t('scene.fullscreenExit') : t('scene.fullscreen')}
                labelFrom={expanded ? 'never' : 'xl'}
                pressed={fullscreen}
                onClick={() => void toggleFullscreen()}
              />
            )}
            <span id="tb-loading" className="visually-hidden">
              {t('scene.loading')}
            </span>
          </div>
          {pop === 'view' && hasModes && <ModePanel className={popPos} onClose={() => closePop()} />}
          {pop === 'credits' && hasCredits && <CreditsPopover className={popPos} onClose={() => closePop()} />}
        </div>
        {coach && ready && (
          <Coach touch={touch} onClose={closeCoach} className="absolute inset-x-3 bottom-[76px] z-(--z-popover) mx-auto w-fit max-w-[calc(100%-24px)] max-md:hidden" />
        )}
        {lesson && <LessonBar ready={ready} />}
        {expanded &&
          (drawer ? (
            <aside className="stage__drawer" aria-label={t('scene.cardPanel')}>
              <div className="stage__drawer-bar">
                <span>{t('scene.cardPanel')}</span>
                <button type="button" className="ibtn" onClick={() => useStageView.setState({ drawer: false })} aria-label={t('scene.hideCard')} title={t('scene.hideCard')}>
                  <Icon name="sidebar" />
                </button>
              </div>
              <ConceptCard />
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
      </section>
      {/* On phones the stage is too small to share: the coach sits right under it instead. */}
      {coach && ready && !expanded && <Coach touch={touch} onClose={closeCoach} className="md:hidden" />}
    </>
  );
}
