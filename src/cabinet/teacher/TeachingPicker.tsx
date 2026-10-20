/**
 * What a teacher teaches (contract 0.6.0 `Teaching`): subject chips from the
 * catalog's live subjects (hue + icon) and grade chips 1–12 (contract 0.8.0 §7). Shared by the
 * registration form and the teacher cabinet (setup checklist, profile). Toggle buttons (`aria-pressed`)
 * inside a fieldset whose legend names the group; errors are linked by id.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr, type Subject } from '@bilig/content-model';
import { subjectSwatch } from '@bilig/scene-core';
import { useCatalog } from '../../api/content';
import { useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { SubjectChip } from '../../components/SubjectChip';
import { useLang } from '../../lib/hooks';
import { useUi } from '../../state/ui';
import { Field, described, inputCls } from './ui';

export const ALL_GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
/** Grades shown first: Bilig's content starts in the 5th grade; 1–4 open on demand. */
const MAIN_GRADES = ALL_GRADES.filter((g) => g >= 5);

const toggle = <T,>(xs: T[], x: T): T[] => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Live subjects of the catalog, in catalog order. */
export function useLiveSubjects(): { subjects: Subject[]; isLoading: boolean; isError: boolean; refetch: () => void } {
  const { data, isLoading, isError, refetch } = useCatalog();
  const subjects = [...(data?.subjects ?? [])].filter((s) => s.status === 'live').sort((a, b) => a.order - b.order);
  return { subjects, isLoading, isError, refetch: () => void refetch() };
}

/** A subject's title in the UI language, or its key while the catalog loads. */
export function useSubjectTitle(): (key: string) => string {
  const lang = useLang();
  const { data } = useCatalog();
  return (key) => {
    const s = data?.subjects.find((x) => x.key === key);
    return s ? tr(s.title, lang) : key;
  };
}

interface GroupProps<T> {
  id: string;
  value: T[];
  onChange: (v: T[]) => void;
  error?: string | null;
  disabled?: boolean;
}

export function SubjectPicker({ id, value, onChange, error, disabled }: GroupProps<string>): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const { subjects, isLoading, isError, refetch } = useLiveSubjects();
  const errId = `${id}-error`;
  return (
    <fieldset className="pick" id={id} aria-describedby={`${id}-hint ${errId}`} aria-invalid={!!error || undefined}>
      <legend>{t('teaching.subjects')}</legend>
      <span id={`${id}-hint`} className="muted small">
        {t('teaching.subjectsHint')}
      </span>
      {isLoading && <span className="skel" style={{ height: 40 }} aria-busy="true" aria-label={t('common.loading')} />}
      {isError && (
        <div className="state state--error">
          <Icon name="warn" />
          <span>{t('catalog.loadError')}</span>
          <button type="button" className="btn2" onClick={refetch}>
            {t('common.retry')}
          </button>
        </div>
      )}
      <div className="chips">
        {subjects.map((s) => {
          const sw = subjectSwatch(s.hue, theme);
          const on = value.includes(s.key);
          return (
            <button key={s.key} type="button" className="chip pick__subj" aria-pressed={on} disabled={disabled} onClick={() => onChange(toggle(value, s.key))}>
              <span className="pick__si" style={{ background: sw.bg, color: sw.fg }} aria-hidden="true">
                <Icon name={s.icon} className="sm" />
              </span>
              {tr(s.title, lang)}
              {on && <Icon name="check" className="sm" />}
            </button>
          );
        })}
      </div>
      <p id={errId} className="error-text" role="alert">
        {error ?? ''}
      </p>
    </fieldset>
  );
}

export function GradePicker({ id, value, onChange, error, disabled }: GroupProps<number>): JSX.Element {
  const { t } = useTranslation();
  const [early, setEarly] = useState(() => value.some((g) => 5 > g));
  const shown = early ? ALL_GRADES : MAIN_GRADES;
  const errId = `${id}-error`;
  return (
    <fieldset className="pick" id={id} aria-describedby={errId} aria-invalid={!!error || undefined}>
      <legend>{t('teaching.grades')}</legend>
      <div className="chips">
        {shown.map((g) => (
          <button
            key={g}
            type="button"
            className="chip sm pick__grade"
            aria-pressed={value.includes(g)}
            aria-label={t('teaching.gradeN', { n: g })}
            disabled={disabled}
            onClick={() => onChange(toggle(value, g).sort((a, b) => a - b))}
          >
            {g}
          </button>
        ))}
        {!early && (
          <button type="button" className="btn2 btn--sm" onClick={() => setEarly(true)} disabled={disabled}>
            <Icon name="plus" className="sm" />
            {t('teaching.earlyGrades')}
          </button>
        )}
      </div>
      <p id={errId} className="error-text" role="alert">
        {error ?? ''}
      </p>
    </fieldset>
  );
}

/** Read-only grades: «5–9, 11». */
export function formatGrades(grades: number[]): string {
  const xs = [...new Set(grades)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    out.push(j - i >= 2 ? `${xs[i]}–${xs[j]}` : xs.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

/** Subjects the teacher's schools are licensed for (union of `me.licenses`), in catalog order. */
export function useLicensedSubjects(): Subject[] {
  const me = useSession((s) => s.me);
  const { data } = useCatalog();
  const keys = new Set((me?.licenses ?? []).flatMap((l) => l.subjects));
  return [...(data?.subjects ?? [])].filter((s) => keys.has(s.key)).sort((a, b) => a.order - b.order);
}

/**
 * Subjects a class can get (contract 0.8.0 §6): a self-registered teacher's trial
 * follows their classes, so every live subject of the catalog; a school licence
 * offers the subjects it covers.
 */
export function useClassSubjectOptions(): { subjects: Subject[]; isLoading: boolean; isError: boolean; refetch: () => void } {
  const me = useSession((s) => s.me);
  const live = useLiveSubjects();
  const licensed = useLicensedSubjects();
  const trial = (me?.licenses ?? []).some((l) => l.trial) || !(me?.licenses ?? []).length;
  return trial || !licensed.length ? live : { ...live, subjects: licensed };
}

/** Subject chip by key (catalog hue + icon); a muted pill while the catalog is unknown. */
export function SubjectKeyChip({ subjectKey }: { subjectKey: string }): JSX.Element {
  const { data } = useCatalog();
  const s = data?.subjects.find((x) => x.key === subjectKey);
  return s ? <SubjectChip subject={s} className="text-sm" /> : <span className="pill pill--muted text-sm">{subjectKey}</span>;
}

/**
 * The class subject (optional): only subjects the teacher has access to. Hidden
 * when there are none; a class's current subject stays listed even if access
 * to it ended.
 */
export function SubjectSelect({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const licensed = useLicensedSubjects();
  if (!licensed.length && !value) return null;
  const known = licensed.some((s) => s.key === value);
  return (
    <Field id={id} label={t('teacher.classForm.subject')} hint={t('teacher.classForm.subjectHint')}>
      <select id={id} className={inputCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-describedby={described(id, true)}>
        <option value="">{t('teacher.classForm.noSubject')}</option>
        {licensed.map((s) => (
          <option key={s.key} value={s.key}>
            {tr(s.title, lang)}
          </option>
        ))}
        {value && !known && <option value={value}>{value}</option>}
      </select>
    </Field>
  );
}
