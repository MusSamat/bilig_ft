/**
 * The three things a phone-registered teacher fills in (contract 0.7.0 §4):
 * their name, their school (name + region) and what they teach. Each form
 * sends PATCH /me with only its own fields; the session follows the answer.
 * Used by the setup checklist and by «Профиль жана мектеп».
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MePatchRequest, MeResponse } from '@bilig/content-model/api';
import { isApiError } from '../../api/client';
import { patchMe, useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey } from '../format';
import { REGIONS } from './regions';
import { GradePicker, SubjectPicker } from './TeachingPicker';
import { Field, btn, described, inputCls } from './ui';

const DAY = 86400_000;
export const daysLeft = (iso: string, now = Date.now()): number => Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY));

/** The self-registered teacher's trial (their own school); school licences are read-only. */
export const trialOf = (me: MeResponse | null | undefined) => me?.licenses?.find((l) => l.trial);

/** First word of the name for the greeting; nothing while the name is still the phone number. */
export function firstName(me: MeResponse | null | undefined): string {
  if (!me || me.setup?.name === false) return '';
  return me.displayName.trim().split(/\s+/)[0] ?? '';
}

export type SetupStep = 'name' | 'school' | 'teaching';
export const SETUP_STEPS: SetupStep[] = ['name', 'school', 'teaching'];

function useSave(okKey: string, onDone: () => void) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (body: MePatchRequest) => {
    setBusy(true);
    setError(null);
    try {
      await patchMe(body);
      toast({ key: okKey, kind: 'success' });
      onDone();
    } catch (err) {
      setError(isApiError(err) && err.code === 'forbidden' ? t('teacher.profile.readOnly') : t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, save };
}

function Actions({ busy, onCancel }: { busy: boolean; onCancel?: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" className={btn('primary')} disabled={busy}>
        <Icon name="check" className="sm" />
        {t('common.save')}
      </button>
      {onCancel && (
        <button type="button" className={btn('ghost')} onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </button>
      )}
    </div>
  );
}

export function NameForm({ idBase, onDone, onCancel }: { idBase: string; onDone: () => void; onCancel?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const [name, setName] = useState(me?.setup?.name === false ? '' : (me?.displayName ?? ''));
  const { busy, error, setError, save } = useSave('teacher.setup.saved.name', onDone);
  const id = `${idBase}-name`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return setError(t('teacher.setup.nameRequired'));
    void save({ displayName: v });
  };
  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <Field id={id} label={t('teacher.setup.nameLabel')} hint={t('teacher.setup.nameHint')} error={error}>
        <input id={id} className={inputCls} value={name} maxLength={100} autoComplete="name" onChange={(e) => setName(e.target.value)} aria-describedby={described(id, true)} aria-invalid={!!error || undefined} />
      </Field>
      <Actions busy={busy} onCancel={onCancel} />
    </form>
  );
}

export function SchoolForm({ idBase, onDone, onCancel }: { idBase: string; onDone: () => void; onCancel?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const trial = trialOf(me);
  const [school, setSchool] = useState(me?.setup?.school === false ? '' : (trial?.schoolName ?? ''));
  const [region, setRegion] = useState('');
  const { busy, error, setError, save } = useSave('teacher.setup.saved.school', onDone);
  const id = `${idBase}-school`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = school.trim();
    if (v.length < 2) return setError(t('teacher.setup.schoolRequired'));
    void save({ schoolName: v, ...(region ? { region } : {}) });
  };
  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <Field id={id} label={t('teacher.setup.schoolLabel')} hint={t('teacher.setup.schoolHint')} error={error}>
        <input id={id} className={inputCls} value={school} maxLength={200} autoComplete="organization" onChange={(e) => setSchool(e.target.value)} aria-describedby={described(id, true)} aria-invalid={!!error || undefined} />
      </Field>
      <Field id={`${id}-region`} label={t('teacher.setup.regionLabel')}>
        <select id={`${id}-region`} className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">{t('teacher.setup.regionNone')}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {t(`teacher.region.${r}`)}
            </option>
          ))}
        </select>
      </Field>
      <Actions busy={busy} onCancel={onCancel} />
    </form>
  );
}

export function TeachingForm({ idBase, onDone, onCancel }: { idBase: string; onDone: () => void; onCancel?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const trial = trialOf(me);
  const start = me?.teaching ?? { subjects: trial?.subjects ?? [], grades: trial?.grades ?? [] };
  const [subjects, setSubjects] = useState(start.subjects);
  const [grades, setGrades] = useState(start.grades);
  const [errors, setErrors] = useState<{ subjects?: string; grades?: string }>({});
  const { busy, error, save } = useSave('teacher.setup.saved.teaching', onDone);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = { subjects: subjects.length ? undefined : t('teacher.setup.subjectsRequired'), grades: grades.length ? undefined : t('teacher.setup.gradesRequired') };
    setErrors(found);
    if (found.subjects || found.grades) {
      document.querySelector<HTMLElement>(`#${idBase}-${found.subjects ? 'subjects' : 'grades'} button`)?.focus();
      return;
    }
    void save({ teaching: { subjects, grades } });
  };
  return (
    <form className="grid gap-4" onSubmit={submit} noValidate aria-label={t('teacher.setup.step.teaching')}>
      <SubjectPicker id={`${idBase}-subjects`} value={subjects} onChange={setSubjects} error={errors.subjects} disabled={busy} />
      <GradePicker id={`${idBase}-grades`} value={grades} onChange={setGrades} error={errors.grades} disabled={busy} />
      <p className="text-sm text-muted">{t('teacher.setup.teachingHint')}</p>
      <p className="text-sm font-semibold text-bad empty:hidden" role="alert">
        {error ?? ''}
      </p>
      <Actions busy={busy} onCancel={onCancel} />
    </form>
  );
}
