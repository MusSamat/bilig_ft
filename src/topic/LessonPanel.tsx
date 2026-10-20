/**
 * Lesson mode for the projector (W-50). Two parts:
 *  - `LessonBar` sits at the bottom edge of the 3D stage (inline and in the
 *    focus view), so «Артка / Кийинки» and «Кадам N / M» are always on screen
 *    next to the model (audit L-1): 48px buttons, the step counter in large
 *    type, arrow keys and presentation remotes (PageUp/PageDown). It applies
 *    each step to the viewer.
 *  - `LessonPanel` sits at the top of the inspector card: the step text, the
 *    teacher note and the lesson tools (present, snapshot, exit).
 * Steps come from the topic's `tour` activity (sample, camera, visibility,
 * modes, focus, text, teacher note, alt text); without a tour the structures
 * are stepped through.
 */
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { L, t as tr, type Tour } from '@bilig/content-model';
import { stepper } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { useKeydown, useLang } from '../lib/hooks';
import { withView } from '../lib/view';
import { useViewer } from '../state/viewer';
import { takeSnapshot } from './actions';
import { useTopic } from './context';
import { showStageSample } from './stageSample';
import { toggleStage, useStageView } from './stageView';

/** The topic's tour (or the structures as steps), the current step and its frame. */
function useLesson() {
  const { pkg, concepts } = useTopic();
  const index = useViewer((s) => s.lessonStep);
  const tour: Tour = useMemo(
    () =>
      pkg.topic.activities.tour ?? {
        steps: concepts.map((c) => ({ key: c.key.replace(/[^a-z0-9]+/g, '-'), focus: c.key, text: c.description, altText: c.title })),
      },
    [pkg, concepts],
  );
  const s = stepper.createStepper(tour.steps.length, index);
  const frame = stepper.lessonFrame(tour, s, concepts.map((c) => c.key));
  return { tour, s, frame };
}

/** Step navigation at the bottom of the stage: always visible while the model is. */
export function LessonBar({ ready }: { ready: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const setLessonStep = useViewer((s) => s.setLessonStep);
  const { tour, s, frame } = useLesson();

  // A tour that puts samples on the stage shows the topic scene at its steps without one.
  const usesSamples = tour.steps.some((st) => st.sample);
  // Apply the step to the viewer: sample on the stage, then focus, visibility, modes, camera on top.
  useEffect(() => {
    if (!ready || !frame) return;
    if (usesSamples) showStageSample(pkg.topic, frame.step.sample ?? null);
    const v = useViewer.getState();
    v.setStepFrame({ visibility: frame.step.visibility ? frame.visibility : null, camera: frame.step.camera ?? null });
    if (frame.step.modes) v.applyModePatch(frame.step.modes);
    v.select(frame.focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.index, tour]);
  useEffect(() => () => useViewer.getState().setStepFrame({ visibility: null, camera: null }), []);

  const go = (cmd: stepper.StepCommand | null) => setLessonStep(stepper.applyStepCommand(s, cmd).index);

  useKeydown(
    (e) => {
      const target = e.target as HTMLElement | null;
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a, summary, [role="treeitem"], [role="tab"]')) return;
      const cmd = stepper.keyToStepCommand(e.key);
      if (!cmd) return;
      e.preventDefault();
      go(cmd);
    },
    { enabled: ready },
  );

  if (!frame) return null;
  const focusConcept = concepts.find((c) => c.key === frame.focus);
  return (
    <div
      className="lesson-bar flex flex-none items-center gap-x-4 gap-y-2 border-t border-edge bg-panel px-3 py-2 [backdrop-filter:var(--blur)] max-md:pe-20 md:px-4 md:[.has-drawer>&]:me-(--drawer-w)"
      role="group"
      aria-label={t('lesson.region')}
      data-testid="lesson-bar"
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <b className="whitespace-nowrap text-md font-semibold tabular-nums text-ink" aria-live="polite">
          <span className="max-sm:sr-only">{t('lesson.step', stepper.stepLabel(s))}</span>
          <span className="sm:hidden" aria-hidden="true">
            {stepper.stepLabel(s).current} / {stepper.stepLabel(s).total}
          </span>
        </b>
        {focusConcept && <span className="hidden min-w-0 truncate text-base text-muted lg:inline">{tr(focusConcept.title, lang)}</span>}
      </span>
      <span className="ms-auto hidden items-center gap-1.5 text-sm text-muted xl:inline-flex" data-lesson-hint>
        <Icon name="keyboard" className="sm" />
        {t('lesson.remoteHint')}
      </span>
      <span className="flex gap-2 max-xl:ms-auto">
        <button type="button" className="btn2 min-h-12 min-w-12 gap-2 px-3 text-md sm:px-4" onClick={() => go('prev')} disabled={stepper.isFirst(s)} aria-label={t('lesson.prev')}>
          <Icon name="prev" />
          <span className="max-sm:sr-only">{t('lesson.prev')}</span>
        </button>
        <button type="button" className="cta min-h-12 gap-2 px-6 text-md" onClick={() => go('next')} disabled={stepper.isLast(s)}>
          {t('lesson.next')}
          <Icon name="next" />
        </button>
      </span>
    </div>
  );
}

/** The step's words for the class and the teacher, at the top of the inspector card. */
export function LessonPanel(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const { pkg, concepts } = useTopic();
  const expanded = useStageView((s) => s.expanded);
  const { frame } = useLesson();

  const exit = () => setParams(withView(params, false));
  if (!frame) return null;
  const focusConcept = concepts.find((c) => c.key === frame.focus);
  const stepText = tr(frame.step.text, lang);
  const showText = !!stepText && (!focusConcept || stepText !== tr(focusConcept.description, lang));
  return (
    <div className="lesson grid gap-3 border-b border-line pb-4" role="group" aria-label={t('lesson.region')} data-ask="lesson">
      {showText && (
        <p className="m-0 text-xl leading-snug" aria-live="polite">
          {stepText}
        </p>
      )}
      <p className="visually-hidden">{tr(frame.step.altText ?? L(''), lang)}</p>
      {frame.step.teacherNote && (
        <p className="m-0 flex gap-2 rounded-md border border-line bg-chip px-3 py-2.5 text-base text-muted">
          <Icon name="grad" className="sm mt-1 shrink-0 text-accent" />
          <span>
            <b>{t('lesson.teacherNote')}:</b> {tr(frame.step.teacherNote, lang)}
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn2 btn--sm" onClick={toggleStage} aria-pressed={expanded}>
          <Icon name={expanded ? 'shrink' : 'expand'} className="sm" />
          {expanded ? t('scene.collapse') : t('lesson.present')}
        </button>
        <button type="button" className="btn2 btn--sm" onClick={() => void takeSnapshot(pkg, lang)}>
          <Icon name="camera" className="sm" />
          {t('scene.snapshot')}
        </button>
        <button type="button" className="btn2 btn--sm btn--ghost" onClick={exit}>
          <Icon name="book" className="sm" />
          {t('lesson.exit')}
        </button>
      </div>
      {!pkg.topic.activities.tour && <p className="m-0 text-sm text-muted">{t('lesson.noTour')}</p>}
    </div>
  );
}
