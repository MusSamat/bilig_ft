/**
 * Teacher cabinet (W-53, scenario «Учитель» 2, 3, 6): classes (server
 * pagination), create a class, and per class — students, join code,
 * assignments, results. Hidden without `class.manage` (the backend enforces it).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../api/client';
import { usePermission, useSession } from '../api/session';
import { errorKey } from '../cabinet/format';
import { AssignmentsTab } from '../cabinet/teacher/AssignmentsTab';
import { JoinCodeTab } from '../cabinet/teacher/JoinCodeTab';
import { ResultsTab } from '../cabinet/teacher/ResultsTab';
import { StudentsTab } from '../cabinet/teacher/StudentsTab';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { toast, useUi } from '../state/ui';
import '../cabinet/cabinet.css';

const TABS = ['students', 'joinCode', 'assignments', 'results'] as const;
type Tab = (typeof TABS)[number];

export default function TeacherPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const canManage = usePermission('class.manage');
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);

  if (status === 'loading') {
    return (
      <div className="page">
        <p className="muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (!canManage) {
    return (
      <div className="page narrow stack">
        <h1>{t('teacher.title')}</h1>
        <p>{t('teacher.noAccess')}</p>
        <div>
          <Link className="btn btn--primary" to={`/${lang}/login`}>
            {t('teacher.signIn')}
          </Link>
        </div>
      </div>
    );
  }
  return <TeacherCabinet />;
}

function TeacherCabinet(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const classes = useInfiniteQuery({
    queryKey: ['classes'],
    queryFn: ({ pageParam }) => api('classList', { query: { limit: 20, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const list = classes.data?.pages.flatMap((p) => p.items) ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [override, setOverride] = useState<SchoolClass | null>(null);
  const selected = (override && override.id === selectedId ? override : null) ?? list.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="page">
      <h1>{t('teacher.title')}</h1>
      <div className="teacher-layout">
        <section className="card stack" aria-labelledby="classes-title">
          <h2 id="classes-title" className="panel-title">
            <Icon name="users" />
            {t('teacher.classes')}
          </h2>
          {classes.isLoading && <p className="muted">{t('common.loading')}</p>}
          {classes.isError && <p className="error-text">{t('teacher.loadError')}</p>}
          {!classes.isLoading && list.length === 0 && <p className="muted">{t('teacher.classesEmpty')}</p>}
          <ul className="class-list">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="btn"
                  aria-current={c.id === selectedId ? 'true' : undefined}
                  aria-label={t('teacher.openClass', { name: c.name })}
                  onClick={() => {
                    setSelectedId(c.id);
                    setOverride(null);
                  }}
                >
                  <b>{c.name}</b>
                  <span className="muted small">{t('teacher.students', { count: c.studentCount })}</span>
                </button>
              </li>
            ))}
          </ul>
          {classes.hasNextPage && (
            <button type="button" className="btn btn--sm" onClick={() => void classes.fetchNextPage()}>
              {t('teacher.loadMore')}
            </button>
          )}
          <NewClassForm
            onCreated={async (c) => {
              await qc.invalidateQueries({ queryKey: ['classes'] });
              setSelectedId(c.id);
              setOverride(c);
            }}
          />
        </section>
        {selected && <ClassPanel key={selected.id} cls={selected} onChange={setOverride} />}
      </div>
    </div>
  );
}

function NewClassForm({ onCreated }: { onCreated: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api('classCreate', { body: { name: name.trim(), grade } });
      toast({ key: 'teacher.created', params: { name: c.name }, kind: 'success' });
      setName('');
      onCreated(c);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <h3>{t('teacher.newClass')}</h3>
      <label className="field">
        <span>{t('teacher.className')}</span>
        <input className="input" value={name} maxLength={40} placeholder={t('teacher.classNamePlaceholder')} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('teacher.grade')}</span>
        <select className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
          {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
            <option key={g} value={g}>
              {t('teacher.gradeN', { n: g })}
            </option>
          ))}
        </select>
      </label>
      <p className="error-text" role="alert">
        {error ?? ''}
      </p>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !name.trim()}>
        <Icon name="plus" size={16} />
        {t('teacher.create')}
      </button>
    </form>
  );
}

function ClassPanel({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('students');
  const move = (dir: number) => {
    const next = TABS[(TABS.indexOf(tab) + dir + TABS.length) % TABS.length];
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`class-tab-${next}`)?.focus());
  };
  return (
    <section className="card stack tabs" aria-labelledby="class-title">
      <h2 id="class-title" className="panel-title">
        {cls.name}
        <span className="muted small">{t('teacher.gradeN', { n: cls.grade })}</span>
      </h2>
      <div
        role="tablist"
        aria-label={t('teacher.tabsLabel')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') move(1);
          if (e.key === 'ArrowLeft') move(-1);
        }}
      >
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" id={`class-tab-${k}`} aria-selected={tab === k} aria-controls={`class-panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>
            {t(`teacher.tab.${k}`)}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`class-panel-${tab}`} aria-labelledby={`class-tab-${tab}`}>
        {tab === 'students' && <StudentsTab cls={cls} />}
        {tab === 'joinCode' && <JoinCodeTab cls={cls} onChange={onChange} />}
        {tab === 'assignments' && <AssignmentsTab cls={cls} />}
        {tab === 'results' && <ResultsTab cls={cls} />}
      </div>
    </section>
  );
}
