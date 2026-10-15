/**
 * Lesson mode for the projector (W-50): large text, «Шаг N из M», Back/Next,
 * keyboard arrows and presentation remotes (PageUp/PageDown). Steps come from
 * the topic's `tour` activity (camera, visibility, modes, focus, text,
 * teacher note, alt text); without a tour the structures are stepped through.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { L, t as tr, type Tour } from '@bilig/content-model';
import { stepper } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { useKeydown, useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { takeSnapshot } from './actions';
import { useTopic } from './context';

export function LessonPanel({ ready }: { ready: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { pkg, concepts } = useTopic();
  const index = useViewer((s) => s.lessonStep);
  const setLessonStep = useViewer((s) => s.setLessonStep);

  const tour: Tour = useMemo(
    () =>
      pkg.topic.activities.tour ?? {
        steps: concepts.map((c) => ({ key: c.key.replace(/[^a-z0-9]+/g, '-'), focus: c.key, text: c.description, altText: c.title })),
      },
    [pkg, concepts],
  );
  const s = stepper.createStepper(tour.steps.length, index);
  const frame = stepper.lessonFrame(tour, s, concepts.map((c) => c.key));

  // Apply the step to the viewer: focus, visibility, modes, camera.
  useEffect(() => {
    if (!ready || !frame) return;
    const v = useViewer.getState();
    v.setStepFrame({ visibility: frame.step.visibility ? frame.visibility : null, camera: frame.step.camera ?? null });
    if (frame.step.modes) v.applyModePatch(frame.step.modes);
    v.select(frame.focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.index, tour]);
  useEffect(() => () => useViewer.getState().setStepFrame({ visibility: null, camera: null }), []);

  const go = (cmd: stepper.StepCommand | null) => setLessonStep(stepper.applyStepCommand(s, cmd).index);

  useKeydown((e) => {
    const target = e.target as HTMLElement | null;
    if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a, [role="treeitem"], [role="tab"]')) return;
    const cmd = stepper.keyToStepCommand(e.key);
    if (!cmd) return;
    e.preventDefault();
    go(cmd);
  }, { enabled: ready });

  const exit = () => {
    const next = new URLSearchParams(params);
    next.delete('view');
    next.delete('lesson');
    setParams(next);
  };
  const label = stepper.stepLabel(s);
  if (!frame) return <div />;
  return (
    <section className="card lesson-panel" aria-label={t('lesson.region')} aria-live="polite">
      {!pkg.topic.activities.tour && <p className="muted small">{t('lesson.noTour')}</p>}
      <span className="lesson-step">{t('lesson.step', label)}</span>
      <p>{tr(frame.step.text, lang)}</p>
      <p className="visually-hidden">{tr(frame.step.altText ?? L(''), lang)}</p>
      {frame.step.teacherNote && (
        <p className="teacher-note">
          <b>{t('lesson.teacherNote')}:</b> {tr(frame.step.teacherNote, lang)}
        </p>
      )}
      <div className="lesson-nav">
        <button type="button" className="btn" onClick={() => go('prev')} disabled={stepper.isFirst(s)}>
          <Icon name="arrow-left" />
          {t('lesson.prev')}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => go('next')} disabled={stepper.isLast(s)}>
          {t('lesson.next')}
          <Icon name="arrow-right" />
        </button>
        <button type="button" className="btn" onClick={() => void takeSnapshot(pkg, lang, true, navigate)}>
          <Icon name="camera" />
          {t('scene.snapshot')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={exit}>
          {t('lesson.exit')}
        </button>
      </div>
      <span className="muted small">
        <Icon name="keyboard" size={16} /> {t('lesson.remoteHint')}
      </span>
    </section>
  );
}
