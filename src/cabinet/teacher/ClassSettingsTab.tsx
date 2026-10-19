/** Class settings: name, grade and (v0.6.0) the subject taught in the class — PATCH /classes/:id. */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ClassPatchRequest, SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey } from '../format';
import { ALL_GRADES, SubjectSelect } from './TeachingPicker';

export function ClassSettingsTab({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(cls.name);
  const [grade, setGrade] = useState(cls.grade);
  const [subjectKey, setSubjectKey] = useState(cls.subjectKey ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('teaching.classNameRequired'));
    const body: ClassPatchRequest = {};
    if (name.trim() !== cls.name) body.name = name.trim();
    if (grade !== cls.grade) body.grade = grade;
    if (subjectKey !== (cls.subjectKey ?? '')) body.subjectKey = subjectKey || null;
    if (!Object.keys(body).length) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api('classPatch', { params: { id: cls.id }, body }));
      await qc.invalidateQueries({ queryKey: ['classes'] });
      toast({ key: 'teaching.classSaved', kind: 'success' });
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <h3>{t('teaching.classSettings')}</h3>
      <div className="field">
        <label htmlFor="class-edit-name">{t('teacher.className')}</label>
        <input id="class-edit-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-describedby="class-edit-error" />
      </div>
      <div className="field">
        <label htmlFor="class-edit-grade">{t('teacher.grade')}</label>
        <select id="class-edit-grade" className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
          {ALL_GRADES.map((g) => (
            <option key={g} value={g}>
              {t('teacher.gradeN', { n: g })}
            </option>
          ))}
        </select>
      </div>
      <SubjectSelect id="class-edit-subject" value={subjectKey} onChange={setSubjectKey} disabled={busy} />
      <p id="class-edit-error" className="error-text" role="alert">
        {error ?? ''}
      </p>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
        <Icon name="check" className="sm" />
        {t('teaching.save')}
      </button>
    </form>
  );
}
