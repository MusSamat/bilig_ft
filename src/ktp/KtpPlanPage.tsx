/**
 * One КТП (`/:lang/teacher/ktp/:id`, contract 0.5.0, `lesson.plan`). Opens on
 * «This week» for the chosen class — days with their lessons and the lesson
 * plan (.docx) one click away; «All lessons» is the secondary view. The
 * problems the checker found have one count (errors + warnings, whole plan)
 * and each opens its lesson. A lesson is edited in one sheet
 * (`?lesson=<index>&at=<class>`). The file can be replaced or deleted.
 * Which of the teacher's classes each КТП column is (v0.8.0 classLinks) is
 * shown under the title and editable there.
 * Lazy route.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@bilig/content-model';
import type { KtpIssue, KtpRow, TeachingPlan } from '@bilig/content-model/api';
import { UI_LANGS } from '../config';
import { isApiError } from '../api/client';
import { usePermission, useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { errorKey } from '../cabinet/format';
import { Card, CardTitle, ErrorState, Skeleton, Tabs, btn, cx, inputCls, type TabItem } from '../cabinet/teacher/ui';
import { useLang } from '../lib/hooks';
import { toast, useUi } from '../state/ui';
import { fetchKtpDocx, fetchLessonPlan, useDownloads, useKtpDelete, useKtpPatch, useKtpPlan } from './api';
import { AllLessons } from './AllLessons';
import { ClassLinks } from './ClassLinks';
import { LessonSheet } from './LessonSheet';
import { capitalize, fixTarget, isDraftPlan, lastClass, planForView, problemCounts, rememberClass, todayIso, weekOf } from './model';
import { ProblemCount, ProblemList } from './Problems';
import { UploadFlow } from './UploadFlow';
import { WeekView } from './WeekView';

const PAGE = 'mx-auto grid w-full max-w-275 content-start gap-6 px-4 pb-10 pt-2 md:px-6';

export default function KtpPlanPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { id } = useParams();
  const allowed = usePermission('lesson.plan');
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);
  const plan = useKtpPlan(allowed ? id : undefined);

  if (status === 'loading' || (allowed && plan.isLoading)) {
    return (
      <div className={PAGE} aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-24 max-w-160" />
        <Skeleton className="h-12" />
        <Skeleton className="h-100" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className={cx(PAGE, 'max-w-160')}>
        <Card className="grid justify-items-start gap-4">
          <h1 className="m-0 font-serif text-2xl font-bold text-ink">{t('ktp.title')}</h1>
          <p className="m-0 flex items-start gap-2 text-base text-muted">
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
  if (plan.isError || !plan.data) {
    const missing = isApiError(plan.error) && plan.error.status === 404;
    return (
      <div className={cx(PAGE, 'max-w-160')}>
        <BackLink />
        <ErrorState text={t(missing ? 'ktp.plan.notFound' : 'ktp.plan.loadError')} onRetry={missing ? undefined : () => void plan.refetch()} />
      </div>
    );
  }
  return <PlanView plan={planForView(plan.data)} />;
}

function BackLink(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <nav aria-label={t('a11y.breadcrumbs')}>
      <Link to={`/${lang}/teacher?tab=ktp`} className="inline-flex min-h-11 items-center gap-1 text-base font-semibold text-accent">
        <Icon name="arrow-left" className="sm" />
        {t('ktp.plan.back')}
      </Link>
    </nav>
  );
}

type View = 'week' | 'all';

function PlanView({ plan }: { plan: TeachingPlan }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // A preliminary КТП has no dates yet: «All lessons» is its home view.
  const draft = isDraftPlan(plan);
  const home: View = draft ? 'all' : 'week';
  const asked = params.get('view');
  const view: View = asked === 'all' || asked === 'week' ? asked : home;
  const lessonIndex = Number(params.get('lesson')) || null;
  const at = params.get('at');
  const [cls, setCls] = useState(() => (at && plan.classes.includes(at) ? at : (lastClass(plan.id, plan.classes) ?? '')));
  const [week, setWeek] = useState(() => weekOf(todayIso()).from);
  const [showProblems, setShowProblems] = useState(false);
  const patch = useKtpPatch(plan.id);
  const { busy, run } = useDownloads();

  const counts = problemCounts(plan.issues);
  const problems = counts.errors + counts.warnings;
  const row = lessonIndex ? plan.rows.find((r) => r.index === lessonIndex) : undefined;

  const setQuery = (next: Record<string, string | null>, push = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: !push });
  };
  const pickClass = (c: string) => {
    setCls(c);
    rememberClass(plan.id, c);
  };
  const openLesson = (r: KtpRow) => setQuery({ lesson: String(r.index), at: null }, true);
  const closeLesson = () => setQuery({ lesson: null, at: null });
  const fix = (i: KtpIssue) => {
    const target = fixTarget(i);
    if (!target) return;
    if (target.view) setQuery({ view: 'all', section: target.section, lesson: null, at: null });
    else setQuery({ lesson: target.lesson, at: target.at ?? null }, true);
  };

  const heading = [capitalize(plan.subjectName || plan.title, lang), plan.grade ? t('teacher.gradeN', { n: plan.grade }) : null].filter(Boolean).join(' · ');
  const facts = [plan.year ? t('ktp.plan.year', { from: plan.year, to: plan.year + 1 }) : null, t('ktp.plan.lessons', { count: plan.rows.length })].filter(Boolean).join(' · ');
  const views: TabItem<View>[] = [
    { key: 'week', label: t('ktp.view.week'), icon: 'calendar' },
    { key: 'all', label: t('ktp.view.all'), icon: 'columns' },
  ];

  return (
    <div className={PAGE}>
      <BackLink />
      <header className="grid gap-1">
        <h1 className="m-0 font-serif text-2xl font-bold text-ink">{heading}</h1>
        <p className="m-0 text-base text-muted">{facts}</p>
        <p className="m-0 line-clamp-2 max-w-[80ch] text-sm text-muted" title={plan.title}>
          {plan.title}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn('secondary')} disabled={busy === 'ktp-docx'} aria-busy={busy === 'ktp-docx'} onClick={() => void run('ktp-docx', () => fetchKtpDocx(plan.id))}>
            <Icon name={busy === 'ktp-docx' ? 'sync' : 'download'} className={cx('sm', busy === 'ktp-docx' && 'spin')} />
            {t('ktp.plan.docx')}
          </button>
        </div>
      </header>

      {draft && (
        <p className="m-0 flex items-start gap-2 rounded-lg border border-line border-l-4 border-l-accent bg-chip p-4 text-base text-ink" data-testid="ktp-draft-info">
          <Icon name="info" className="mt-0.5 flex-none text-accent" />
          {t('ktp.plan.draftInfo')}
        </p>
      )}

      <ClassLinks plan={plan} className="rounded-lg border border-line p-4" />

      <section className={cx('grid gap-4 rounded-lg border p-4', counts.errors ? 'border-bad' : problems ? 'border-gold' : 'border-ok')} aria-labelledby="ktp-problems-title">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="ktp-problems-title" className="visually-hidden">
            {t('ktp.problems.title')}
          </h2>
          <ProblemCount errors={counts.errors} warnings={counts.warnings} />
          {problems > 0 && (
            <button type="button" className={btn('secondary', 'ms-auto')} aria-expanded={showProblems} aria-controls="ktp-problems" onClick={() => setShowProblems((v) => !v)}>
              <Icon name={showProblems ? 'chevron-down' : 'chevron-right'} className="sm" />
              {t(showProblems ? 'ktp.problems.hide' : 'ktp.problems.show')}
            </button>
          )}
        </div>
        {showProblems && problems > 0 && (
          <div id="ktp-problems">
            <ProblemList issues={plan.issues} rows={plan.rows} onFix={fix} />
          </div>
        )}
      </section>

      {plan.rows.length === 0 ? (
        <ErrorState text={t('ktp.plan.noRows')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {plan.classes.length > 0 && (
              <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby="ktp-class-label">
                <span id="ktp-class-label" className="text-base font-semibold text-ink">
                  {t('ktp.plan.class')}
                </span>
                <div className="flex gap-1 rounded-pill border border-line bg-chip p-1">
                  {plan.classes.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={c === cls}
                      onClick={() => pickClass(c)}
                      className={cx('inline-flex min-h-11 min-w-14 items-center justify-center rounded-pill border-0 px-4 text-base font-semibold transition-colors', c === cls ? 'bg-accent text-on' : 'bg-transparent text-ink hover:bg-soft')}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Tabs items={views} value={view} onChange={(v) => setQuery({ view: v === home ? null : v, section: null })} label={t('ktp.view.label')} idBase="ktp-view" />
          </div>

          <Card as="div" className="grid gap-4">
            <div role="tabpanel" id="ktp-view-panel" aria-labelledby={`ktp-view-tab-${view}`} className="min-w-0">
              {view === 'week' ? (
                <WeekView plan={plan} cls={cls} week={week} onWeek={setWeek} onOpen={openLesson} busy={busy} run={run} />
              ) : (
                <AllLessons plan={plan} cls={cls} onOpen={openLesson} openSection={params.get('section')} />
              )}
            </div>
          </Card>
          <p className="m-0 text-sm text-muted">{t('ktp.draftNote')}</p>
        </>
      )}

      <Settings
        plan={plan}
        heading={heading}
        onLang={(l) => void patch([], { lang: l })}
        onReplaced={(p, search) => navigate({ pathname: `/${lang}/teacher/ktp/${p.id}`, search: search ? `?${new URLSearchParams(search)}` : '' }, { replace: true })}
        onDeleted={() => navigate(`/${lang}/teacher?tab=ktp`)}
      />

      {row && (
        <LessonSheet
          key={row.index}
          plan={plan}
          row={row}
          cls={cls}
          focusClass={at}
          busy={busy === `sheet-${row.index}`}
          onDownload={() => void run(`sheet-${row.index}`, () => fetchLessonPlan(plan.id, row.index, cls))}
          onSave={(p) =>
            void patch([p]).then((saved) => {
              if (saved) toast({ key: 'ktp.sheet.saved', kind: 'success' });
            })
          }
          onClose={closeLesson}
        />
      )}
    </div>
  );
}

function Settings({
  plan,
  heading,
  onLang,
  onReplaced,
  onDeleted,
}: {
  plan: TeachingPlan;
  heading: string;
  onLang: (l: Lang) => void;
  onReplaced: (p: TeachingPlan, search?: Record<string, string> | null) => void;
  onDeleted: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const del = useKtpDelete();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'idle' | 'replace' | 'delete'>('idle');
  return (
    <section className="grid gap-4 rounded-lg border border-line bg-chip p-4" aria-labelledby="ktp-settings-title">
      <h2 id="ktp-settings-title" className="m-0">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 border-0 bg-transparent p-0 text-start text-md font-semibold text-ink"
          aria-expanded={open}
          aria-controls="ktp-settings"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} className="sm text-muted" />
          <Icon name="file" className="sm text-muted" />
          {t('ktp.settings.title')}
        </button>
      </h2>
      {open && (
        <div id="ktp-settings" className="grid gap-5">
          <ul className="m-0 grid list-none gap-1 p-0 text-base text-ink">
            <li>{t('ktp.settings.file', { name: plan.sourceName })}</li>
            {plan.teacherName && <li>{t('ktp.settings.teacher', { name: plan.teacherName })}</li>}
            {plan.schoolName && <li>{plan.schoolName}</li>}
            <li>
              {plan.declaredHours !== null && plan.declaredHours !== plan.totalHours
                ? t('ktp.settings.hours', { actual: plan.totalHours, declared: plan.declaredHours })
                : t('ktp.settings.hoursOnly', { count: plan.totalHours })}
            </li>
          </ul>
          <div className="grid max-w-80 gap-1.5">
            <label htmlFor="ktp-lang" className="text-sm font-semibold text-ink">
              {t('ktp.settings.lang')}
            </label>
            <select id="ktp-lang" className={inputCls} value={plan.lang} onChange={(e) => onLang(e.target.value as Lang)}>
              {UI_LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`ktp.langName.${l}`)}
                </option>
              ))}
            </select>
          </div>
          {mode === 'replace' ? (
            <div className="grid gap-3">
              <CardTitle level={3} icon="upload">
                {t('ktp.upload.replaceTitle')}
              </CardTitle>
              <UploadFlow replaces={plan} onDone={(p) => onReplaced(p)} onFix={(p, i) => onReplaced(p, fixTarget(i))} onCancel={() => setMode('idle')} />
            </div>
          ) : mode === 'delete' ? (
            <div className="grid gap-3 rounded-lg border border-bad p-3" role="group" aria-label={t('ktp.settings.delete')}>
              <p className="m-0 text-base text-ink">{t('ktp.list.confirmDelete', { title: heading })}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={btn('danger')}
                  disabled={del.isPending}
                  onClick={() =>
                    del.mutate(
                      { id: plan.id, version: plan.version },
                      {
                        onSuccess: () => {
                          toast({ key: 'ktp.list.deleted', kind: 'success' });
                          onDeleted();
                        },
                        onError: (e) => {
                          setMode('idle');
                          toast({ key: errorKey(e), kind: 'error' });
                        },
                      },
                    )
                  }
                >
                  <Icon name="trash" className="sm" />
                  {t('common.delete')}
                </button>
                <button type="button" className={btn('secondary')} autoFocus onClick={() => setMode('idle')}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btn('secondary')} onClick={() => setMode('replace')}>
                <Icon name="upload" className="sm" />
                {t('ktp.settings.replace')}
              </button>
              <button type="button" className={btn('danger')} onClick={() => setMode('delete')}>
                <Icon name="trash" className="sm" />
                {t('ktp.settings.delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
