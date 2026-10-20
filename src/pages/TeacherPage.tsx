/**
 * Teacher cabinet (W-53; contract 0.8.0 §6). Server-driven: while GET /me says
 * `profileStatus: 'incomplete'` the teacher sees only the focused setup screen
 * (name → school → teaching language → first class with subjects). Once
 * complete: one calm page, max 1100px — a greeting with the trial days, then
 * four sections as tabs (`?tab=`): home «Менин класстарым» (tiles of the
 * teacher's own classes, `class.manage`), lesson plans / КТП (`lesson.plan`,
 * lazy chunk), my textbook, profile & school. A class opens in place
 * (`?class=<id>&view=`): its subjects first (КТП status, next lesson,
 * progress), students, assignments, results, join code and settings after.
 */
import { Suspense, lazy, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api, isApiError } from '../api/client';
import { usePermission, useSession } from '../api/session';
import { AssignmentsTab } from '../cabinet/teacher/AssignmentsTab';
import { ClassSettingsTab } from '../cabinet/teacher/ClassForm';
import { ClassesSection, classSubjectKeys } from '../cabinet/teacher/ClassesSection';
import { JoinCodeTab } from '../cabinet/teacher/JoinCodeTab';
import { ProfileSection } from '../cabinet/teacher/ProfileSection';
import { ResultsTab } from '../cabinet/teacher/ResultsTab';
import { ClassSubjects } from '../cabinet/teacher/ClassSubjects';
import { SetupScreen } from '../cabinet/teacher/SetupScreen';
import { StudentsTab } from '../cabinet/teacher/StudentsTab';
import { TextbooksSection } from '../cabinet/teacher/TextbooksSection';
import { SubjectKeyChip } from '../cabinet/teacher/TeachingPicker';
import { daysLeft, firstName, trialOf } from '../cabinet/teacher/profileForms';
import { Card, Chip, CopyButton, ErrorState, Skeleton, Tabs, btn, cardCls, cx, type TabItem } from '../cabinet/teacher/ui';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';

const KtpTab = lazy(() => import('../ktp/KtpTab'));

const PAGE = 'mx-auto grid w-full max-w-275 content-start gap-6 px-4 pb-10 pt-2 md:px-6';

export default function TeacherPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const canManage = usePermission('class.manage');
  const canPlan = usePermission('lesson.plan');
  const status = useSession((s) => s.status);
  const incomplete = useSession((s) => s.me?.profileStatus === 'incomplete');
  const [params] = useSearchParams();
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);

  if (status === 'loading') {
    return (
      <div className={PAGE} aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-16 max-w-100" />
        <Skeleton className="h-12" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (!canManage && !canPlan) {
    return (
      <div className={cx(PAGE, 'max-w-160')}>
        <Card labelledBy="teacher-title" className="grid justify-items-start gap-4">
          <h1 id="teacher-title" className="font-serif text-2xl font-bold text-ink">
            {t('teacher.title')}
          </h1>
          <p className="flex items-start gap-2 text-base text-muted">
            <Icon name="lock" />
            {t('teacher.noAccess')}
          </p>
          <Link className={btn('primary')} to={`/${lang}/login`}>
            <Icon name="user" className="sm" />
            {t('teacher.signIn')}
          </Link>
        </Card>
      </div>
    );
  }
  if (incomplete && canManage) {
    return (
      <div className={PAGE}>
        <SetupScreen />
      </div>
    );
  }
  const classId = params.get('class');
  return <div className={PAGE}>{classId && canManage ? <ClassView key={classId} id={classId} /> : <Overview canManage={canManage} canPlan={canPlan} />}</div>;
}

const SECTIONS = ['classes', 'ktp', 'textbook', 'profile'] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_ICON: Record<Section, string> = { classes: 'users', ktp: 'cal', textbook: 'book', profile: 'user' };

function Overview({ canManage, canPlan }: { canManage: boolean; canPlan: boolean }): JSX.Element {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const [params, setParams] = useSearchParams();
  const shown = SECTIONS.filter((s) => (s === 'classes' ? canManage : s === 'ktp' ? canPlan : true));
  const asked = params.get('tab') as Section | null;
  const section: Section = asked && shown.includes(asked) ? asked : shown[0];
  const go = (s: Section) => setParams(s === shown[0] ? {} : { tab: s }, { replace: true });
  const name = firstName(me);
  const trial = trialOf(me);
  const days = trial ? daysLeft(trial.endsAt) : 0;
  const items: TabItem<Section>[] = shown.map((s) => ({ key: s, label: t(`teacher.section.${s}`), icon: SECTION_ICON[s] }));

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-muted">{t('teacher.title')}</p>
          <h1 id="teacher-title" tabIndex={-1} className="font-serif text-2xl font-bold text-ink outline-none">
            {name ? t('teacher.hello', { name }) : t('teacher.helloNoName')}
          </h1>
        </div>
        {trial && (
          <Chip tone={days <= 7 ? 'warn' : 'neutral'}>
            <Icon name="clock" className="sm" />
            {t('teacher.trialLeft', { count: days })}
          </Chip>
        )}
      </header>
      <Tabs items={items} value={section} onChange={go} label={t('teacher.sectionsLabel')} idBase="teacher" className="justify-self-start max-w-full" />
      <div role="tabpanel" id="teacher-panel" aria-labelledby={`teacher-tab-${section}`} className="min-w-0">
        {section === 'classes' && (
          <Card>
            <ClassesSection />
          </Card>
        )}
        {section === 'ktp' && (
          <Suspense fallback={<Skeleton className="h-60" />}>
            <KtpTab />
          </Suspense>
        )}
        {section === 'textbook' && (
          <Card>
            <TextbooksSection />
          </Card>
        )}
        {section === 'profile' && <ProfileSection />}
      </div>
    </>
  );
}

const VIEWS = ['subjects', 'students', 'assignments', 'results', 'joinCode', 'settings'] as const;
type View = (typeof VIEWS)[number];
const VIEW_ICON: Record<View, string> = { subjects: 'book', students: 'users', assignments: 'target', results: 'chart', joinCode: 'key', settings: 'cog' };

function ClassView({ id }: { id: string }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const fromList = () => (qc.getQueryData(['classes']) as InfiniteData<{ items: SchoolClass[] }> | undefined)?.pages.flatMap((p) => p.items).find((c) => c.id === id);
  const q = useQuery({ queryKey: ['classes', 'one', id], queryFn: () => api('classGet', { params: { id } }), placeholderData: fromList, retry: false });
  const cls = q.data;
  const asked = params.get('view') as View | null;
  const view: View = asked && VIEWS.includes(asked) ? asked : 'subjects';
  const go = (v: View) => setParams(v === 'subjects' ? { class: id } : { class: id, view: v }, { replace: true });
  // Under ['classes'] so that every change to the class list refreshes it too.
  const onChange = (c: SchoolClass) => qc.setQueryData(['classes', 'one', id], c);

  const crumbs = (
    <nav aria-label={t('a11y.breadcrumbs')}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-sm">
        <li>
          <Link to={{ search: '' }} className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent">
            <Icon name="arrow-left" className="sm" />
            {t('teacher.title')}
          </Link>
        </li>
        {cls && (
          <li className="inline-flex items-center gap-1 text-muted">
            <Icon name="chev" className="sm" />
            <span aria-current="page">{cls.name}</span>
          </li>
        )}
      </ol>
    </nav>
  );

  if (!cls) {
    return (
      <>
        {crumbs}
        {q.isError ? (
          <ErrorState text={isApiError(q.error) && q.error.status === 404 ? t('teacher.classNotFound') : t('teacher.loadError')} onRetry={() => void q.refetch()} />
        ) : (
          <Skeleton className="h-60" />
        )}
      </>
    );
  }

  const items: TabItem<View>[] = VIEWS.map((v) => ({ key: v, label: t(`teacher.tab.${v}`), icon: VIEW_ICON[v] }));
  return (
    <>
      {crumbs}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-2">
          <h1 id="class-title" className="font-serif text-2xl font-bold text-ink">
            {cls.name}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-base text-muted">
            <span>{t('teacher.gradeN', { n: cls.grade })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('teacher.students', { count: cls.studentCount })}</span>
            {classSubjectKeys(cls).map((k) => (
              <SubjectKeyChip key={k} subjectKey={k} />
            ))}
          </p>
        </div>
        {cls.joinCodeEnabled && (
          <div className="flex items-center gap-2 rounded-pill border border-line bg-chip py-1 ps-4 pe-1">
            <span className="text-sm text-muted">{t('teacher.codeShort')}</span>
            <b className="font-mono text-md tracking-[0.2em] text-ink">{cls.joinCode}</b>
            <CopyButton value={cls.joinCode} label={t('teacher.copyCode')} />
          </div>
        )}
      </header>
      <Tabs items={items} value={view} onChange={go} label={t('teacher.tabsLabel')} idBase="class" className="justify-self-start max-w-full" />
      <div role="tabpanel" id="class-panel" aria-labelledby={`class-tab-${view}`} className={cx(view !== 'subjects' && cardCls, 'min-w-0')}>
        {view === 'subjects' && <ClassSubjects cls={cls} onChange={onChange} />}
        {view === 'students' && <StudentsTab cls={cls} />}
        {view === 'assignments' && <AssignmentsTab cls={cls} />}
        {view === 'results' && <ResultsTab cls={cls} />}
        {view === 'joinCode' && <JoinCodeTab cls={cls} onChange={onChange} />}
        {view === 'settings' && <ClassSettingsTab cls={cls} onChange={onChange} />}
      </div>
    </>
  );
}
