/**
 * A class as the teacher names it (contract 0.8.0 §6): the label exactly as
 * typed («8Б», «8-В», «9 А»), the grade 1–12 and one or more subjects. One
 * form for «Класс кошуу» (POST /classes { subjectKeys }, in a sheet or inline
 * on the setup screen) and the class settings (PATCH, name and grade only —
 * subjects are added and removed on the class's subject cards).
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr, type Subject } from '@bilig/content-model';
import type { ClassPatchRequest, SchoolClass } from '@bilig/content-model/api';
import { subjectSwatch } from '@bilig/scene-core';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useLang } from '../../lib/hooks';
import { toast, useUi } from '../../state/ui';
import { errorKey } from '../format';
import { ALL_GRADES, useClassSubjectOptions } from './TeachingPicker';
import { Field, Sheet, btn, cx, described, inputCls } from './ui';

interface Values {
  name: string;
  grade: number | '';
  subjectKeys: string[];
}
type Valid = { name: string; grade: number; subjectKeys: string[] };
type Errors = Partial<Record<'name' | 'grade' | 'subjects', string>>;

const toggle = (xs: string[], x: string): string[] => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Subject toggles (`aria-pressed`) in a fieldset: one or more subjects of the catalog. */
export function SubjectToggles({
  id,
  value,
  onChange,
  error,
  disabled,
  exclude = [],
  legend,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  error?: string | null;
  disabled?: boolean;
  exclude?: string[];
  legend?: string;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const { subjects, isLoading, isError, refetch } = useClassSubjectOptions();
  const shown = subjects.filter((s: Subject) => !exclude.includes(s.key));
  return (
    <fieldset id={id} className="m-0 grid gap-2 border-0 p-0" aria-describedby={`${id}-hint ${id}-error`} aria-invalid={!!error || undefined}>
      <legend className="mb-1 p-0 text-sm font-semibold text-ink">{legend ?? t('teacher.classForm.subjects')}</legend>
      <span id={`${id}-hint`} className="text-sm text-muted">
        {t('teacher.classForm.subjectsHint')}
      </span>
      {isLoading && <span className="block h-11 rounded-lg bg-soft" aria-busy="true" aria-label={t('common.loading')} />}
      {isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad px-4 py-2" role="alert">
          <span className="text-base text-ink">{t('catalog.loadError')}</span>
          <button type="button" className={btn('secondary')} onClick={refetch}>
            {t('common.retry')}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {shown.map((s) => {
          const on = value.includes(s.key);
          const sw = subjectSwatch(s.hue, theme);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(toggle(value, s.key))}
              className={cx(
                'inline-flex min-h-11 items-center gap-2 rounded-pill border py-1 ps-1 pe-4 text-base font-semibold text-ink transition-colors hover:border-accent disabled:opacity-50',
                on ? 'border-accent bg-soft' : 'border-line bg-chip',
              )}
            >
              <span className="inline-flex size-8 flex-none items-center justify-center rounded-pill" style={{ background: sw.bg, color: sw.fg }} aria-hidden="true">
                <Icon name={on ? 'check' : s.icon} className="sm" />
              </span>
              {tr(s.title, lang)}
            </button>
          );
        })}
      </div>
      <span id={`${id}-error`} role="alert" className="text-sm font-semibold text-bad empty:hidden">
        {error ?? ''}
      </span>
    </fieldset>
  );
}

export function ClassFields({
  idBase,
  initial,
  withSubjects,
  busy,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idBase: string;
  initial: Values;
  withSubjects: boolean;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (v: Valid) => void;
  onCancel?: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Errors = {
      name: v.name.trim() ? undefined : t('teacher.classForm.nameRequired'),
      grade: v.grade === '' ? t('teacher.classForm.gradeRequired') : undefined,
      subjects: withSubjects && !v.subjectKeys.length ? t('teacher.classForm.subjectsRequired') : undefined,
    };
    setErrors(found);
    if (found.name) return document.getElementById(`${idBase}-name`)?.focus();
    if (found.grade) return document.getElementById(`${idBase}-grade`)?.focus();
    if (found.subjects) return document.querySelector<HTMLElement>(`#${idBase}-subjects button`)?.focus();
    onSubmit({ name: v.name.trim(), grade: v.grade as number, subjectKeys: v.subjectKeys });
  };
  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idBase}-name`} label={t('teacher.classForm.name')} hint={t('teacher.classForm.nameHint')} error={errors.name}>
          <input
            id={`${idBase}-name`}
            className={inputCls}
            value={v.name}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => setV({ ...v, name: e.target.value })}
            aria-describedby={described(`${idBase}-name`, true)}
            aria-invalid={!!errors.name || undefined}
          />
        </Field>
        <Field id={`${idBase}-grade`} label={t('teacher.classForm.grade')} error={errors.grade}>
          <select
            id={`${idBase}-grade`}
            className={inputCls}
            value={v.grade}
            onChange={(e) => setV({ ...v, grade: e.target.value ? Number(e.target.value) : '' })}
            aria-describedby={described(`${idBase}-grade`)}
            aria-invalid={!!errors.grade || undefined}
          >
            <option value="">{t('teacher.classForm.gradeChoose')}</option>
            {ALL_GRADES.map((g) => (
              <option key={g} value={g}>
                {t('teacher.gradeN', { n: g })}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {withSubjects && <SubjectToggles id={`${idBase}-subjects`} value={v.subjectKeys} onChange={(subjectKeys) => setV({ ...v, subjectKeys })} error={errors.subjects} disabled={busy} />}
      <p className="m-0 text-sm font-semibold text-bad empty:hidden" role="alert">
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

/** POST /classes with the label as typed, the grade and the subjects; the class list refreshes. */
export function useCreateClass(onCreated: (c: SchoolClass) => void | Promise<void>) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (v: Valid) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api('classCreate', { body: { name: v.name, grade: v.grade, subjectKeys: v.subjectKeys } });
      await qc.invalidateQueries({ queryKey: ['classes'] });
      toast({ key: 'teacher.created', params: { name: c.name }, kind: 'success' });
      await onCreated(c);
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  };
  return { busy, error, create };
}

export const NEW_CLASS: Values = { name: '', grade: '', subjectKeys: [] };

/** «Класс кошуу» in a sheet. */
export function NewClassSheet({ onClose, onCreated, initial = NEW_CLASS }: { onClose: () => void; onCreated: (c: SchoolClass) => void; initial?: Values }): JSX.Element {
  const { t } = useTranslation();
  const { busy, error, create } = useCreateClass(onCreated);
  return (
    <Sheet title={t('teacher.classForm.newTitle')} onClose={onClose}>
      <ClassFields idBase="new-class" initial={initial} withSubjects busy={busy} error={error} submitLabel={t('teacher.classForm.create')} onSubmit={(v) => void create(v)} onCancel={onClose} />
    </Sheet>
  );
}

/** Class settings tab: rename, change the grade. */
export function ClassSettingsTab({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (v: Valid) => {
    const body: ClassPatchRequest = {};
    if (v.name !== cls.name) body.name = v.name;
    if (v.grade !== cls.grade) body.grade = v.grade;
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
      <ClassFields
        idBase="class-edit"
        initial={{ name: cls.name, grade: cls.grade, subjectKeys: [] }}
        withSubjects={false}
        busy={busy}
        error={error}
        submitLabel={t('common.save')}
        onSubmit={(v) => void save(v)}
      />
    </div>
  );
}
