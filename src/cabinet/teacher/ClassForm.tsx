/**
 * Class name, grade and subject: one form for «Класс кошуу» (POST /classes, in a
 * sheet) and for the class settings (PATCH /classes/:id, only changed fields).
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ClassPatchRequest, SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey } from '../format';
import { ALL_GRADES, SubjectSelect } from './TeachingPicker';
import { Field, Sheet, btn, described, inputCls } from './ui';

interface Values {
  name: string;
  grade: number;
  subjectKey: string;
}

function ClassFields({ idBase, initial, busy, error, submitLabel, onSubmit, onCancel }: { idBase: string; initial: Values; busy: boolean; error: string | null; submitLabel: string; onSubmit: (v: Values) => void; onCancel?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const [v, setV] = useState(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) {
      setNameError(t('teacher.classForm.nameRequired'));
      document.getElementById(`${idBase}-name`)?.focus();
      return;
    }
    setNameError(null);
    onSubmit({ ...v, name: v.name.trim() });
  };
  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <Field id={`${idBase}-name`} label={t('teacher.classForm.name')} hint={t('teacher.classForm.nameHint')} error={nameError}>
        <input
          id={`${idBase}-name`}
          className={inputCls}
          value={v.name}
          maxLength={40}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          aria-describedby={described(`${idBase}-name`, true)}
          aria-invalid={!!nameError || undefined}
        />
      </Field>
      <Field id={`${idBase}-grade`} label={t('teacher.classForm.grade')}>
        <select id={`${idBase}-grade`} className={inputCls} value={v.grade} onChange={(e) => setV({ ...v, grade: Number(e.target.value) })}>
          {ALL_GRADES.map((g) => (
            <option key={g} value={g}>
              {t('teacher.gradeN', { n: g })}
            </option>
          ))}
        </select>
      </Field>
      <SubjectSelect id={`${idBase}-subject`} value={v.subjectKey} onChange={(subjectKey) => setV({ ...v, subjectKey })} disabled={busy} />
      <p className="text-sm font-semibold text-bad empty:hidden" role="alert">
        {error ?? ''}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btn('primary')} disabled={busy}>
          <Icon name="check" className="sm" />
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={btn('ghost')} onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}

/** «Класс кошуу» in a sheet. */
export function NewClassSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (v: Values) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api('classCreate', { body: { name: v.name, grade: v.grade, ...(v.subjectKey ? { subjectKey: v.subjectKey } : {}) } });
      await qc.invalidateQueries({ queryKey: ['classes'] });
      toast({ key: 'teacher.created', params: { name: c.name }, kind: 'success' });
      onCreated(c);
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  };
  return (
    <Sheet title={t('teacher.classForm.newTitle')} onClose={onClose}>
      <ClassFields idBase="new-class" initial={{ name: '', grade: 7, subjectKey: '' }} busy={busy} error={error} submitLabel={t('teacher.classForm.create')} onSubmit={(v) => void create(v)} onCancel={onClose} />
    </Sheet>
  );
}

/** Class settings tab: rename, change grade or subject. */
export function ClassSettingsTab({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (v: Values) => {
    const body: ClassPatchRequest = {};
    if (v.name !== cls.name) body.name = v.name;
    if (v.grade !== cls.grade) body.grade = v.grade;
    if (v.subjectKey !== (cls.subjectKey ?? '')) body.subjectKey = v.subjectKey || null;
    if (!Object.keys(body).length) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api('classPatch', { params: { id: cls.id }, body }));
      await qc.invalidateQueries({ queryKey: ['classes'] });
      toast({ key: 'teacher.classForm.saved', kind: 'success' });
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid max-w-130 gap-4">
      <h2 className="font-serif text-lg font-bold text-ink">{t('teacher.classForm.settingsTitle')}</h2>
      <ClassFields idBase="class-edit" initial={{ name: cls.name, grade: cls.grade, subjectKey: cls.subjectKey ?? '' }} busy={busy} error={error} submitLabel={t('common.save')} onSubmit={(v) => void save(v)} />
    </div>
  );
}
