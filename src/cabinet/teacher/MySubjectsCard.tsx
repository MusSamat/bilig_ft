/**
 * «My subjects» (contract 0.6.0): what the teacher teaches (`me.teaching`) and the
 * licences of their schools (`me.licenses`: school, subjects, grades, until, trial
 * with days left). A self-registered teacher (trial licence) edits subjects and
 * grades with PATCH /me { teaching } — the trial follows. A school licence is
 * read-only: the school admin changes it.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MyLicense } from '@bilig/content-model/api';
import { isApiError } from '../../api/client';
import { patchMe, useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { useLang } from '../../lib/hooks';
import { toast } from '../../state/ui';
import { errorKey, formatDate } from '../format';
import { GradePicker, SubjectKeyChip, SubjectPicker, formatGrades } from './TeachingPicker';

const DAY = 86400_000;
export const daysLeft = (iso: string, now = Date.now()): number => Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY));

export function MySubjectsCard(): JSX.Element | null {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const licenses = me?.licenses ?? [];
  const teaching = me?.teaching;
  if (!me || (!teaching && !licenses.length)) return null;
  const trial = licenses.find((l) => l.trial);
  const editable = !!trial;

  return (
    <section className="card stack my-subjects" aria-labelledby="my-subjects-title">
      <div className="my-subjects__h">
        <h2 id="my-subjects-title" className="panel-title">
          <Icon name="book" />
          {t('teaching.title')}
        </h2>
        {editable && !editing && (
          <button ref={editRef} type="button" className="btn2 btn--sm" onClick={() => setEditing(true)}>
            <Icon name="edit" className="sm" />
            {t('teaching.edit')}
          </button>
        )}
      </div>
      {editing && trial ? (
        <TeachingEditor
          initial={teaching ?? { subjects: trial.subjects, grades: trial.grades }}
          onDone={() => {
            setEditing(false);
            requestAnimationFrame(() => editRef.current?.focus());
          }}
        />
      ) : (
        teaching && (
          <dl className="my-subjects__teach">
            <dt>{t('teaching.subjects')}</dt>
            <dd className="chips">
              {teaching.subjects.map((k) => (
                <SubjectKeyChip key={k} subjectKey={k} />
              ))}
            </dd>
            <dt>{t('teaching.grades')}</dt>
            <dd>{formatGrades(teaching.grades)}</dd>
          </dl>
        )
      )}
      {licenses.length > 0 && (
        <ul className="lic-list" aria-label={t('teaching.licenses')}>
          {licenses.map((l) => (
            <LicenseRow key={`${l.schoolId}:${l.startsAt}`} lic={l} />
          ))}
        </ul>
      )}
      {!editable && (
        <p className="auth__note">
          <Icon name="info" className="sm" />
          {t('teaching.readOnly')}
        </p>
      )}
    </section>
  );
}

function LicenseRow({ lic }: { lic: MyLicense }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const days = daysLeft(lic.endsAt);
  return (
    <li className="lic">
      <div className="lic__h">
        <Icon name="school" className="sm" />
        <b>{lic.schoolName}</b>
        {lic.trial && (
          <span className={days <= 7 ? 'badge badge--warn' : 'badge'}>
            <Icon name="clock" className="sm" />
            {t('teaching.trial', { count: days })}
          </span>
        )}
      </div>
      <div className="chips">
        {lic.subjects.map((k) => (
          <SubjectKeyChip key={k} subjectKey={k} />
        ))}
      </div>
      <p className="muted small">
        {t('teaching.licGrades', { grades: formatGrades(lic.grades) })} · {t('teaching.until', { date: formatDate(lang, lic.endsAt) })}
      </p>
    </li>
  );
}

function TeachingEditor({ initial, onDone }: { initial: { subjects: string[]; grades: number[] }; onDone: () => void }): JSX.Element {
  const { t } = useTranslation();
  const [subjects, setSubjects] = useState(initial.subjects);
  const [grades, setGrades] = useState(initial.grades);
  const [errors, setErrors] = useState<{ subjects?: string; grades?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = {
      subjects: subjects.length ? undefined : t('register.error.subjects'),
      grades: grades.length ? undefined : t('register.error.grades'),
    };
    setErrors(found);
    if (found.subjects || found.grades) {
      document.querySelector<HTMLElement>(`#${found.subjects ? 'my-subjects-pick' : 'my-grades-pick'} button`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await patchMe({ teaching: { subjects, grades } });
      toast({ key: 'teaching.saved', kind: 'success' });
      onDone();
    } catch (err) {
      setErrors({ form: isApiError(err) && err.code === 'forbidden' ? t('teaching.readOnly') : t(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label={t('teaching.editLabel')}>
      <SubjectPicker id="my-subjects-pick" value={subjects} onChange={setSubjects} error={errors.subjects} disabled={busy} />
      <GradePicker id="my-grades-pick" value={grades} onChange={setGrades} error={errors.grades} disabled={busy} />
      <p className="muted small">{t('teaching.trialFollows')}</p>
      <p className="error-text" role="alert">
        {errors.form ?? ''}
      </p>
      <div className="row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          <Icon name="check" className="sm" />
          {t('teaching.save')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone} disabled={busy}>
          {t('teaching.cancel')}
        </button>
      </div>
    </form>
  );
}
