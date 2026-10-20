/**
 * «Аккаунтту бүтүрүңүз» (contract 0.7.0 §4): after a phone registration the
 * teacher still names themself, their school and what they teach. Three steps
 * with progress «2/3»; each opens its form inline; the card disappears once
 * GET /me `setup` is all true.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { NameForm, SETUP_STEPS, SchoolForm, TeachingForm, trialOf, type SetupStep } from './profileForms';
import { formatGrades, useSubjectTitle } from './TeachingPicker';
import { btn, cardCls, cx } from './ui';

const ICON: Record<SetupStep, string> = { name: 'user', school: 'school', teaching: 'book' };

export function SetupChecklist(): JSX.Element | null {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const setup = me?.setup;
  const firstOpen = SETUP_STEPS.find((s) => setup && !setup[s]) ?? null;
  const [open, setOpen] = useState<SetupStep | null>(null);
  const subjectTitle = useSubjectTitle();
  if (!me || !setup || SETUP_STEPS.every((s) => setup[s])) return null;
  const done = SETUP_STEPS.filter((s) => setup[s]).length;

  const value = (s: SetupStep): string | null => {
    if (!setup[s]) return null;
    if (s === 'name') return me.displayName;
    if (s === 'school') return trialOf(me)?.schoolName ?? null;
    return me.teaching ? `${me.teaching.subjects.map(subjectTitle).join(', ')} · ${t('teacher.gradesShort', { grades: formatGrades(me.teaching.grades) })}` : null;
  };

  const start = (s: SetupStep) => {
    setOpen(s);
    const first = () => document.querySelector(`#setup-form-${s} input, #setup-form-${s} button`) as HTMLElement | null;
    requestAnimationFrame(() => first()?.focus());
  };

  const finish = (s: SetupStep) => {
    setOpen(null);
    const state = useSession.getState().me?.setup;
    if (state && SETUP_STEPS.every((x) => state[x])) {
      toast({ key: 'teacher.setup.allDone', kind: 'success' });
      requestAnimationFrame(() => document.getElementById('teacher-title')?.focus());
      return;
    }
    const next = SETUP_STEPS.find((x) => state && !state[x]) ?? s;
    requestAnimationFrame(() => document.getElementById(`setup-btn-${next}`)?.focus());
  };

  return (
    <section className={cx(cardCls, 'grid gap-5 border-accent')} aria-labelledby="setup-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="setup-title" className="font-serif text-xl font-bold text-ink">
            {t('teacher.setup.title')}
          </h2>
          <p className="max-w-[60ch] text-base text-muted">{t('teacher.setup.lead')}</p>
        </div>
        <span className="text-md font-bold text-accent" aria-label={t('teacher.setup.progressLabel', { done, total: SETUP_STEPS.length })}>
          {done}/{SETUP_STEPS.length}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-pill bg-soft"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={SETUP_STEPS.length}
        aria-valuenow={done}
        aria-label={t('teacher.setup.progressLabel', { done, total: SETUP_STEPS.length })}
      >
        <span className="block h-full rounded-pill bg-accent transition-[width]" style={{ width: `${(done / SETUP_STEPS.length) * 100}%` }} />
      </div>
      <ol className="m-0 grid list-none gap-3 p-0">
        {SETUP_STEPS.map((s, i) => {
          const ok = setup[s];
          const expanded = open === s;
          const v = value(s);
          return (
            <li key={s} className={cx('grid gap-4 rounded-lg border p-4', expanded ? 'border-accent bg-chip' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cx('inline-flex size-10 flex-none items-center justify-center rounded-pill text-base font-bold', ok ? 'bg-ok text-white' : 'border-2 border-accent text-accent')}
                  aria-hidden="true"
                >
                  {ok ? <Icon name="check" /> : i + 1}
                </span>
                <div className="grid min-w-0 flex-1 basis-40">
                  <span className="font-semibold text-ink">
                    {t(`teacher.setup.step.${s}`)}
                    <span className="sr-only"> — {ok ? t('teacher.setup.done') : t('teacher.setup.todo')}</span>
                  </span>
                  <span className="text-sm text-muted">{v ?? t(`teacher.setup.hint.${s}`)}</span>
                </div>
                {!expanded && (
                  <button
                    type="button"
                    id={`setup-btn-${s}`}
                    className={btn(!ok && s === firstOpen ? 'primary' : 'secondary')}
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
                  {s === 'name' && <NameForm idBase="setup" onDone={() => finish(s)} onCancel={() => setOpen(null)} />}
                  {s === 'school' && <SchoolForm idBase="setup" onDone={() => finish(s)} onCancel={() => setOpen(null)} />}
                  {s === 'teaching' && <TeachingForm idBase="setup" onDone={() => finish(s)} onCancel={() => setOpen(null)} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
