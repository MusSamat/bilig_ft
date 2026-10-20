/**
 * Lesson mode stepper for the projector (W-50), inside the inspector: the
 * tour step text, the teacher note, «Шаг N из M» with Back / Next, keyboard
 * arrows and presentation remotes (PageUp/PageDown). Steps come from the
 * topic's `tour` activity (sample, camera, visibility, modes, focus, text,
 * teacher note, alt text); without a tour the structures are stepped through.
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

export function LessonPanel({ ready }: { ready: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const { pkg, concepts } = useTopic();
  const index = useViewer((s) => s.lessonStep);
  const setLessonStep = useViewer((s) => s.setLessonStep);
  const expanded = useStageView((s) => s.expanded);

  const tour: Tour = useMemo(
    () =>
      pkg.topic.activities.tour ?? {
        steps: concepts.map((c) => ({ key: c.key.replace(/[^a-z0-9]+/g, '-'), focus: c.key, text: c.description, altText: c.title })),
      },
    [pkg, concepts],
  );
  const s = stepper.createStepper(tour.steps.length, index);
  const frame = stepper.lessonFrame(tour, s, concepts.map((c) => c.key));

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
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a, [role="treeitem"], [role="tab"]')) return;
      const cmd = stepper.keyToStepCommand(e.key);
      if (!cmd) return;
      e.preventDefault();
      go(cmd);
    },
    { enabled: ready },
  );

  const exit = () => setParams(withView(params, false));
  if (!frame) return null;
  const label = stepper.stepLabel(s);
  const focusConcept = concepts.find((c) => c.key === frame.focus);
  const stepText = tr(frame.step.text, lang);
  const showText = !!stepText && (!focusConcept || stepText !== tr(focusConcept.description, lang));
  return (
    <div className="lesson" role="group" aria-label={t('lesson.region')} data-ask="lesson">
      {showText && (
        <p className="lesson__text" aria-live="polite">
          {stepText}
        </p>
      )}
      <p className="visually-hidden">{tr(frame.step.altText ?? L(''), lang)}</p>
      {frame.step.teacherNote && (
        <p className="lesson__note">
          <Icon name="grad" className="sm" />
          <span>
            <b>{t('lesson.teacherNote')}:</b> {tr(frame.step.teacherNote, lang)}
          </span>
        </p>
      )}
      <div className="lstep">
        <span aria-live="polite">{t('lesson.step', label)}</span>
        <button type="button" className="btn2" onClick={() => go('prev')} disabled={stepper.isFirst(s)}>
          <Icon name="prev" className="sm" />
          {t('lesson.prev')}
        </button>
        <button type="button" className="cta" onClick={() => go('next')} disabled={stepper.isLast(s)}>
          {t('lesson.next')}
          <Icon name="next" className="sm" />
        </button>
      </div>
      <div className="lesson__tools">
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
        <span className="muted small lesson__hint">
          <Icon name="keyboard" className="sm" /> {t('lesson.remoteHint')}
          {!pkg.topic.activities.tour && <> · {t('lesson.noTour')}</>}
        </span>
      </div>
    </div>
  );
}
