/**
 * The setup screen (contract 0.8.0 §6.1): while GET /me says
 * `profileStatus: 'incomplete'`, the teacher sees this focused page instead of
 * the cabinet — four steps with progress (full name → school → teaching
 * language → first class with its subjects). The first open step is expanded
 * with its form; each saves on its own (PATCH /me or POST /classes) and the
 * next one opens. Once the server reports `complete`, the page gives way to
 * the home «Менин класстарым». Gentle hints say what can wait.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadMe, useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { ClassFields, NEW_CLASS, useCreateClass } from './ClassForm';
import { classSubjectKeys, useClasses } from './ClassesSection';
import { NameForm, SETUP_STEPS, SchoolForm, TeachingLangForm, stepDone, trialOf, type SetupStep } from './profileForms';
import { useSubjectTitle } from './TeachingPicker';
import { btn, cardCls, cx } from './ui';

const ICON: Record<SetupStep, string> = { name: 'user', school: 'school', teachingLang: 'globe', classWithSubject: 'users' };

const focusFirst = (s: SetupStep) =>
  requestAnimationFrame(() => (document.querySelector(`#setup-form-${s} input, #setup-form-${s} select, #setup-form-${s} button`) as HTMLElement | null)?.focus());

export function SetupScreen(): JSX.Element | null {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const subjectTitle = useSubjectTitle();
  const classes = useClasses();
  const firstOpen = me ? (SETUP_STEPS.find((s) => !stepDone(me, s)) ?? null) : null;
  const [open, setOpen] = useState<SetupStep | null>(firstOpen);
  useEffect(() => {
    if (open) focusFirst(open);
    // Only on arrival: later steps are focused as they open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!me) return null;
  const done = SETUP_STEPS.filter((s) => stepDone(me, s)).length;
  const total = SETUP_STEPS.length;
  const withSubject = (classes.data?.pages.flatMap((p) => p.items) ?? []).find((c) => classSubjectKeys(c).length > 0);

  const value = (s: SetupStep): string | null => {
    if (!stepDone(me, s)) return null;
    if (s === 'name') return me.displayName;
    if (s === 'school') return trialOf(me)?.schoolName ?? me.licenses?.[0]?.schoolName ?? null;
    if (s === 'teachingLang') return me.teachingLang ? t(`teacher.teachingLang.${me.teachingLang}`) : null;
    return withSubject ? [withSubject.name, ...classSubjectKeys(withSubject).map(subjectTitle)].join(' · ') : t('teacher.setup.classDone');
  };

  const start = (s: SetupStep) => {
    setOpen(s);
    focusFirst(s);
  };

  /** After a save: open the next step, or say «ready» when the server reports the profile complete. */
  const finish = (s: SetupStep) => {
    const state = useSession.getState().me;
    if (state?.profileStatus === 'complete') {
      toast({ key: 'teacher.setup.allDone', kind: 'success' });
      requestAnimationFrame(() => document.getElementById('teacher-title')?.focus());
      return;
    }
    const next = state ? (SETUP_STEPS.find((x) => !stepDone(state, x)) ?? null) : null;
    setOpen(next);
    if (next) focusFirst(next);
    else requestAnimationFrame(() => document.getElementById(`setup-btn-${s}`)?.focus());
  };
  const close = (s: SetupStep) => {
    setOpen(null);
    requestAnimationFrame(() => document.getElementById(`setup-btn-${s}`)?.focus());
  };

  return (
    <div className="mx-auto grid w-full max-w-180 gap-6">
      <header className="grid gap-1">
        <p className="text-sm font-semibold text-muted">{t('teacher.title')}</p>
        <h1 id="teacher-title" tabIndex={-1} className="font-serif text-2xl font-bold text-ink outline-none">
          {t('teacher.setup.title')}
        </h1>
        <p className="max-w-[60ch] text-base text-muted">{t('teacher.setup.lead')}</p>
      </header>

      <section className={cx(cardCls, 'grid gap-5')} aria-labelledby="setup-steps-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="setup-steps-title" className="text-md font-semibold text-ink">
            {t('teacher.setup.stepsTitle')}
          </h2>
          <span className="text-md font-bold text-accent">{t('teacher.setup.progress', { done, total })}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-pill bg-soft"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t('teacher.setup.progressLabel', { done, total })}
        >
          <span className="block h-full rounded-pill bg-accent transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <ol className="m-0 grid list-none gap-3 p-0">
          {SETUP_STEPS.map((s, i) => {
            const ok = stepDone(me, s);
            const expanded = open === s;
            const v = value(s);
            return (
              <li key={s} className={cx('grid gap-4 rounded-lg border p-4', expanded ? 'border-accent bg-chip' : 'border-line')} data-testid={`setup-step-${s}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={cx('inline-flex size-10 flex-none items-center justify-center rounded-pill text-base font-bold', ok ? 'bg-ok text-white' : 'border-2 border-accent text-accent')}
                    aria-hidden="true"
                  >
                    {ok ? <Icon name="check" /> : i + 1}
                  </span>
                  <div className="grid min-w-0 flex-1 basis-40">
                    <h3 className="m-0 text-base font-semibold text-ink">
                      {t(`teacher.setup.step.${s}`)}
                      <span className="sr-only"> — {ok ? t('teacher.setup.done') : t('teacher.setup.todo')}</span>
                    </h3>
                    <span className="text-sm text-muted">{v ?? t(`teacher.setup.hint.${s}`)}</span>
                  </div>
                  {!expanded && (
                    <button
                      type="button"
                      id={`setup-btn-${s}`}
                      className={btn('secondary')}
                      aria-expanded={false}
                      aria-controls={`setup-form-${s}`}
                      aria-label={`${ok ? t('teacher.setup.change') : t('teacher.setup.fill')}: ${t(`teacher.setup.step.${s}`)}`}
                      onClick={() => start(s)}
                    >
                      <Icon name={ok ? 'edit' : ICON[s]} className="sm" />
                      {ok ? t('teacher.setup.change') : t('teacher.setup.fill')}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div id={`setup-form-${s}`}>
                    {s === 'name' && <NameForm idBase="setup" onDone={() => finish(s)} onCancel={ok ? () => close(s) : undefined} />}
                    {s === 'school' && <SchoolForm idBase="setup" onDone={() => finish(s)} onCancel={ok ? () => close(s) : undefined} />}
                    {s === 'teachingLang' && <TeachingLangForm idBase="setup" onDone={() => finish(s)} onCancel={ok ? () => close(s) : undefined} />}
                    {s === 'classWithSubject' && <FirstClassForm onDone={() => finish(s)} onCancel={ok ? () => close(s) : undefined} />}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="flex items-start gap-3 rounded-lg border border-line bg-chip p-4" aria-label={t('teacherHome.hints.title')}>
        <Icon name="info" className="mt-0.5 flex-none text-accent" />
        <p className="m-0 text-base text-muted">{t('teacher.setup.later')}</p>
      </aside>
    </div>
  );
}

/** Step 4: the first class with its subjects (POST /classes), then /me is reloaded for the new status. */
function FirstClassForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { busy, error, create } = useCreateClass(async () => {
    await loadMe();
    onDone();
  });
  return (
    <div className="grid gap-3">
      <p className="m-0 text-sm text-muted">{t('teacher.setup.classLead')}</p>
      <ClassFields idBase="setup-class" initial={NEW_CLASS} withSubjects busy={busy} error={error} submitLabel={t('teacher.classForm.create')} onSubmit={(v) => void create(v)} onCancel={onCancel} />
    </div>
  );
}
