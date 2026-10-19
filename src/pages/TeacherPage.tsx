/**
 * Teacher cabinet (W-53, scenario «Учитель» 2, 3, 6): classes (server
 * pagination), create a class, and per class — students, join code,
 * assignments, results. Hidden without `class.manage` (the backend enforces it).
 * v0.5.0: a second section «Сабак пландары» (КТП → lesson plans, `lesson.plan`,
 * lazy chunk) — `?tab=ktp`.
 * v0.6.0: «My subjects» (teaching + licences), a welcome banner after
 * self-registration (`?welcome=1`), and the class subject (licensed subjects only).
 */
import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../api/client';
import { usePermission, useSession } from '../api/session';
import { errorKey } from '../cabinet/format';
import { AssignmentsTab } from '../cabinet/teacher/AssignmentsTab';
import { ClassSettingsTab } from '../cabinet/teacher/ClassSettingsTab';
import { JoinCodeTab } from '../cabinet/teacher/JoinCodeTab';
import { MySubjectsCard } from '../cabinet/teacher/MySubjectsCard';
import { ResultsTab } from '../cabinet/teacher/ResultsTab';
import { StudentsTab } from '../cabinet/teacher/StudentsTab';
import { SubjectKeyChip, SubjectSelect } from '../cabinet/teacher/TeachingPicker';
import { WelcomeBanner } from '../cabinet/teacher/WelcomeBanner';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { toast, useUi } from '../state/ui';

const KtpTab = lazy(() => import('../ktp/KtpTab'));

const TABS = ['students', 'joinCode', 'assignments', 'results', 'settings'] as const;
type Tab = (typeof TABS)[number];

export default function TeacherPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const canManage = usePermission('class.manage');
  const canPlan = usePermission('lesson.plan');
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);

  if (status === 'loading') {
    return (
      <div className="page" aria-busy="true" aria-label={t('common.loading')}>
        <span className="panel glass skel" style={{ height: 100 }} />
        <span className="panel glass skel" style={{ height: 380 }} />
      </div>
    );
  }
  if (!canManage && !canPlan) {
    return (
      <div className="page page--narrow">
        <section className="card stack" aria-labelledby="teacher-title">
          <h1 id="teacher-title" className="page-title">
            {t('teacher.title')}
          </h1>
          <div className="state">
            <Icon name="lock" />
            <span>{t('teacher.noAccess')}</span>
            <Link className="cta" to={`/${lang}/login`}>
              <Icon name="user" className="sm" />
              {t('teacher.signIn')}
            </Link>
          </div>
        </section>
      </div>
    );
  }
  return <TeacherSections canManage={canManage} canPlan={canPlan} />;
}

const SECTIONS = ['classes', 'ktp'] as const;
type Section = (typeof SECTIONS)[number];

/** Page-level sections: classes (`class.manage`) and КТП / lesson plans (`lesson.plan`). */
function TeacherSections({ canManage, canPlan }: { canManage: boolean; canPlan: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const shown = SECTIONS.filter((s) => (s === 'classes' ? canManage : canPlan));
  const asked = params.get('tab') as Section | null;
  const section: Section = asked && shown.includes(asked) ? asked : shown[0];
  const go = (s: Section) => setParams(s === shown[0] ? {} : { tab: s }, { replace: true });
  const move = (dir: number) => {
    const next = shown[(shown.indexOf(section) + dir + shown.length) % shown.length];
    go(next);
    requestAnimationFrame(() => document.getElementById(`teacher-tab-${next}`)?.focus());
  };
  const tabbed = shown.length > 1;
  const [welcome, setWelcome] = useState(() => params.get('welcome') === '1');
  const closeWelcome = () => {
    setWelcome(false);
    if (params.has('welcome')) {
      const next = new URLSearchParams(params);
      next.delete('welcome');
      setParams(next, { replace: true });
    }
  };
  return (
    <div className="page">
      <header className="page-h panel glass">
        <span className="orb s" aria-hidden="true">
          <Icon name="school" />
        </span>
        <div>
          <h1 className="page-title">{t('teacher.title')}</h1>
        </div>
        {tabbed && (
          <div
            role="tablist"
            className="ptabs"
            aria-label={t('teacher.sectionsLabel')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(1);
              if (e.key === 'ArrowLeft') move(-1);
            }}
          >
            {shown.map((s) => (
              <button key={s} type="button" className="tab" role="tab" id={`teacher-tab-${s}`} aria-selected={section === s} aria-controls={`teacher-panel-${s}`} tabIndex={section === s ? 0 : -1} onClick={() => go(s)}>
                <Icon name={s === 'ktp' ? 'cal' : 'users'} className="sm" />
                {t(`teacher.section.${s}`)}
              </button>
            ))}
          </div>
        )}
      </header>
      {welcome && (
        <WelcomeBanner
          onClose={closeWelcome}
          onCreateClass={
            canManage
              ? () => {
                  go('classes');
                  requestAnimationFrame(() => document.getElementById('new-class-name')?.focus());
                }
              : undefined
          }
          onKtp={canPlan ? () => go('ktp') : undefined}
        />
      )}
      <MySubjectsCard />
      <div role={tabbed ? 'tabpanel' : undefined} id={`teacher-panel-${section}`} aria-labelledby={tabbed ? `teacher-tab-${section}` : undefined}>
        {section === 'classes' ? (
          <TeacherCabinet />
        ) : (
          <Suspense fallback={<span className="panel glass skel" style={{ height: 240 }} aria-busy="true" aria-label={t('common.loading')} />}>
            <KtpTab />
          </Suspense>
        )}
      </div>
    </div>
  );
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
    <div className="teacher-layout">
      <section className="card stack" aria-labelledby="classes-title">
        <h2 id="classes-title" className="panel-title">
          <Icon name="users" />
          {t('teacher.classes')}
        </h2>
        {classes.isLoading && (
          <div className="stack" aria-busy="true" aria-label={t('common.loading')}>
            <span className="skel" style={{ height: 52 }} />
            <span className="skel" style={{ height: 52 }} />
          </div>
        )}
        {classes.isError && (
          <div className="state state--error" role="alert">
            <Icon name="warn" />
            <b>{t('teacher.loadError')}</b>
            <button type="button" className="btn2" onClick={() => void classes.refetch()}>
              <Icon name="reset" className="sm" />
              {t('common.retry')}
            </button>
          </div>
        )}
        {!classes.isLoading && !classes.isError && list.length === 0 && (
          <div className="state">
            <Icon name="users" />
            <span>{t('teacher.classesEmpty')}</span>
          </div>
        )}
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
                {c.subjectKey && <SubjectKeyChip subjectKey={c.subjectKey} />}
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
  );
}

function NewClassForm({ onCreated }: { onCreated: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(7);
  const [subjectKey, setSubjectKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api('classCreate', { body: { name: name.trim(), grade, ...(subjectKey ? { subjectKey } : {}) } });
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
        <input id="new-class-name" className="input" value={name} maxLength={40} placeholder={t('teacher.classNamePlaceholder')} onChange={(e) => setName(e.target.value)} />
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
      <SubjectSelect id="new-class-subject" value={subjectKey} onChange={setSubjectKey} />
      <p className="error-text" role="alert">
        {error ?? ''}
      </p>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !name.trim()}>
        <Icon name="plus" className="sm" />
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
    <section className="card stack" aria-labelledby="class-title">
      <h2 id="class-title" className="panel-title">
        {cls.name}
        <span className="muted small">{t('teacher.gradeN', { n: cls.grade })}</span>
        {cls.subjectKey && <SubjectKeyChip subjectKey={cls.subjectKey} />}
      </h2>
      <div
        role="tablist"
        className="ptabs"
        aria-label={t('teacher.tabsLabel')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') move(1);
          if (e.key === 'ArrowLeft') move(-1);
        }}
      >
        {TABS.map((k) => (
          <button key={k} type="button" className="tab" role="tab" id={`class-tab-${k}`} aria-selected={tab === k} aria-controls={`class-panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>
            {t(`teacher.tab.${k}`)}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`class-panel-${tab}`} aria-labelledby={`class-tab-${tab}`}>
        {tab === 'students' && <StudentsTab cls={cls} />}
        {tab === 'joinCode' && <JoinCodeTab cls={cls} onChange={onChange} />}
        {tab === 'assignments' && <AssignmentsTab cls={cls} />}
        {tab === 'results' && <ResultsTab cls={cls} />}
        {tab === 'settings' && <ClassSettingsTab cls={cls} onChange={onChange} />}
      </div>
    </section>
  );
}
