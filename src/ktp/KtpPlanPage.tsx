/**
 * One КТП (`/:lang/teacher/ktp/:id`, contract 0.5.0, `lesson.plan`): every
 * lesson with its date for the chosen class, the problems found, the linked
 * Bilig topic, and the official lesson plan (.docx) for a lesson, today, the
 * week or a range — «план урока за 1 минуту из вашего КТП». Lazy route.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UI_LANGS } from '../config';
import type { Lang } from '@bilig/content-model';
import type { KtpRow, TeachingPlan } from '@bilig/content-model/api';
import { isApiError } from '../api/client';
import { useCatalog } from '../api/content';
import { usePermission, useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { SubjectChip } from '../components/SubjectChip';
import { useLang, useMediaQuery } from '../lib/hooks';
import { useUi } from '../state/ui';
import { fetchLessonPlan, fetchLessonPlans, useDownloads, useKtpPatch, useKtpPlan } from './api';
import { LessonCards, LessonTable, useIssueText, type LessonCtx } from './LessonList';
import {
  KTP_MAX_RANGE,
  countBySeverity,
  groupBySection,
  indexRange,
  isProblem,
  lastClass,
  lessonsBetween,
  longDate,
  nextLesson,
  planIssues,
  rangeOk,
  rangeSize,
  rememberClass,
  rowIssues,
  todayIso,
  weekOf,
} from './model';

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
      <div className="page" aria-busy="true" aria-label={t('common.loading')}>
        <span className="panel glass skel" style={{ height: 140 }} />
        <span className="panel glass skel" style={{ height: 420 }} />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="page page--narrow">
        <section className="card stack">
          <h1 className="page-title">{t('ktp.tab')}</h1>
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
  if (plan.isError || !plan.data) {
    const missing = isApiError(plan.error) && plan.error.status === 404;
    return (
      <div className="page page--narrow">
        <BackLink />
        <div className="state state--error" role="alert">
          <Icon name="warn" />
          <b>{t(missing ? 'ktp.plan.notFound' : 'ktp.plan.loadError')}</b>
          {!missing && (
            <button type="button" className="btn2" onClick={() => void plan.refetch()}>
              <Icon name="reset" className="sm" />
              {t('common.retry')}
            </button>
          )}
        </div>
      </div>
    );
  }
  return <PlanView plan={plan.data} />;
}

function BackLink(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Link className="btn btn--sm btn--ghost ktp-back" to={`/${lang}/teacher?tab=ktp`}>
      <Icon name="arrow-left" className="sm" />
      {t('ktp.plan.back')}
    </Link>
  );
}

function PlanView({ plan }: { plan: TeachingPlan }): JSX.Element {
  const { t } = useTranslation();
  const narrow = useMediaQuery('(max-width: 720px)');
  const [cls, setCls] = useState(() => lastClass(plan.id, plan.classes) ?? '');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const patch = useKtpPatch(plan.id);
  const { busy, run } = useDownloads();

  const pickClass = (c: string) => {
    setCls(c);
    rememberClass(plan.id, c);
  };

  const visible = useMemo(() => (onlyProblems ? plan.rows.filter((r) => rowIssues(plan.issues, r.index, cls).some(isProblem)) : plan.rows), [plan, cls, onlyProblems]);
  const groups = useMemo(() => groupBySection(visible), [visible]);

  const ctx: LessonCtx = {
    plan,
    cls,
    busy,
    range,
    save: (rows) => void patch(rows),
    download: (row) => void run(`row-${row.index}`, () => fetchLessonPlan(plan.id, row.index, cls)),
    onSelect: (index, shift) => {
      if (shift && anchor !== null) {
        setRange({
          from: Math.min(anchor, index),
          to: Math.max(anchor, index),
        });
        return;
      }
      setAnchor(index);
      setRange((r) => (r && r.from === index && r.to === index ? null : { from: index, to: index }));
    },
  };

  return (
    <div className="page ktp-page">
      <BackLink />
      <PlanHeader plan={plan} cls={cls} onClass={pickClass} onlyProblems={onlyProblems} onOnlyProblems={setOnlyProblems} onLang={(l) => void patch([], { lang: l })} />
      {cls && <WeekBar plan={plan} cls={cls} busy={busy} run={run} />}
      <section className="card stack" aria-labelledby="ktp-lessons-title">
        <div className="ktp-lessons-h">
          <h2 id="ktp-lessons-title" className="panel-title">
            <Icon name="cal" />
            {t('ktp.lessons.title', { class: cls })}
          </h2>
          <RangeBar plan={plan} cls={cls} range={range} setRange={setRange} busy={busy} run={run} />
        </div>
        {plan.rows.length === 0 ? (
          <div className="state">
            <Icon name="file" />
            <span>{t('ktp.plan.noRows')}</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="state">
            <Icon name="check" />
            <span>{t('ktp.plan.noProblems', { class: cls })}</span>
          </div>
        ) : narrow ? (
          <LessonCards groups={groups} ctx={ctx} />
        ) : (
          <LessonTable groups={groups} ctx={ctx} />
        )}
        <p className="muted small">{t('ktp.draftNote')}</p>
      </section>
    </div>
  );
}

function PlanHeader({
  plan,
  cls,
  onClass,
  onlyProblems,
  onOnlyProblems,
  onLang,
}: {
  plan: TeachingPlan;
  cls: string;
  onClass: (c: string) => void;
  onlyProblems: boolean;
  onOnlyProblems: (v: boolean) => void;
  onLang: (l: Lang) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const text = useIssueText();
  const { data: catalog } = useCatalog();
  const subject = plan.subjectKey ? catalog?.subjects.find((s) => s.key === plan.subjectKey) : undefined;
  const forClass = plan.issues.filter((i) => !i.class || i.class === cls);
  const counts = countBySeverity(forClass);
  const general = planIssues(plan.issues);
  const listed = forClass.filter((i) => i.row !== undefined).sort((a, b) => a.row! - b.row!);

  return (
    <header className="card stack ktp-head">
      <div className="ktp-head__top">
        <span className="orb s" aria-hidden="true">
          <Icon name="cal" />
        </span>
        <div className="ktp-head__title">
          <h1 className="ktp-title">{plan.title || plan.subjectName}</h1>
          <p className="ktp-meta">
            <span>{plan.subjectName}</span>
            {subject && <SubjectChip subject={subject} />}
            {plan.grade && <span>{t('teacher.gradeN', { n: plan.grade })}</span>}
            {plan.year && <span>{t('ktp.plan.year', { from: plan.year, to: plan.year + 1 })}</span>}
            <span>
              {plan.declaredHours !== null
                ? t('ktp.plan.hours', {
                    actual: plan.totalHours,
                    declared: plan.declaredHours,
                  })
                : t('ktp.plan.hoursOnly', { count: plan.totalHours })}
            </span>
          </p>
          {(plan.teacherName || plan.schoolName) && (
            <p className="muted small">{[plan.teacherName && t('ktp.plan.teacher', { name: plan.teacherName }), plan.schoolName].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      </div>
      <div className="ktp-head__controls">
        {plan.classes.length > 0 && (
          <div className="field">
            <span id="ktp-class-label">{t('ktp.plan.class')}</span>
            <div className="seg sm flat" role="group" aria-labelledby="ktp-class-label">
              {plan.classes.map((c) => (
                <button key={c} type="button" aria-pressed={c === cls} onClick={() => onClass(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="field ktp-lang">
          <span>{t('ktp.plan.lang')}</span>
          <select className="input" value={plan.lang} onChange={(e) => onLang(e.target.value as Lang)}>
            {UI_LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`ktp.langName.${l}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ktp-summary" aria-live="polite">
        {counts.errors + counts.warnings === 0 ? (
          <span className="badge badge--ok">
            <Icon name="check" className="sm" />
            {t('ktp.issues.none')}
          </span>
        ) : (
          <>
            {counts.errors > 0 && (
              <span className="pill pill--bad">
                <Icon name="warn" className="sm" />
                {t('ktp.issues.errors', { count: counts.errors })}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="pill ktp-pill--warn">
                <Icon name="info" className="sm" />
                {t('ktp.issues.warnings', { count: counts.warnings })}
              </span>
            )}
          </>
        )}
        {counts.infos > 0 && <span className="pill pill--muted">{t('ktp.issues.infos', { count: counts.infos })}</span>}
        <label className="ktp-only">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => onOnlyProblems(e.target.checked)} />
          {t('ktp.issues.onlyProblems')}
        </label>
      </div>
      {general.length > 0 && (
        <ul className="ktp-general">
          {general.map((i, n) => (
            <li key={n} className={`ktp-issue-line ktp-issue-line--${i.severity}`}>
              <Icon name={i.severity === 'error' ? 'warn' : 'info'} className="sm" />
              {text(i)}
            </li>
          ))}
        </ul>
      )}
      {listed.length > 0 && (
        <details className="ktp-all">
          <summary>{t('ktp.issues.showAll', { count: listed.length })}</summary>
          <ul>
            {listed.map((i, n) => (
              <li key={n} className={`ktp-issue-line ktp-issue-line--${i.severity}`}>
                <a href={`#ktp-row-${i.row}`}>{t('ktp.issues.at', { row: i.row, class: i.class ?? cls })}</a> {text(i)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </header>
  );
}

type Run = ReturnType<typeof useDownloads>['run'];

function WeekBar({ plan, cls, busy, run }: { plan: TeachingPlan; cls: string; busy: string | null; run: Run }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const today = todayIso();
  const week = weekOf(today);
  const lessons = lessonsBetween(plan, cls, week.from, week.to);
  const todays = lessons.filter((r) => r.dates[cls] === today);
  const range = indexRange(lessons);
  const next = lessons.length ? undefined : nextLesson(plan, cls, today);
  const tooMany = !!range && rangeSize(range) > KTP_MAX_RANGE;

  const item = (r: KtpRow, isToday: boolean) => (
    <li key={r.index} className="ktp-week__item" data-today={isToday || undefined}>
      <span className="ktp-week__date">{isToday ? t('ktp.week.today') : longDate(lang, r.dates[cls]!)}</span>
      <span className="ktp-week__title">
        <b>{r.index}.</b> {r.title || t('ktp.untitled')}
      </span>
      <button
        type="button"
        className={isToday ? 'btn btn--primary btn--sm' : 'btn btn--sm'}
        disabled={busy === `week-${r.index}`}
        aria-label={t('ktp.action.planFor', { n: r.index, class: cls })}
        onClick={() => void run(`week-${r.index}`, () => fetchLessonPlan(plan.id, r.index, cls))}
      >
        <Icon name="download" className="sm" />
        {t('ktp.action.plan')}
      </button>
    </li>
  );

  return (
    <section className="card stack ktp-week" aria-labelledby="ktp-week-title">
      <div className="ktp-week__h">
        <h2 id="ktp-week-title" className="panel-title">
          <Icon name="clock" />
          {t('ktp.week.title', { class: cls })}
          <span className="muted small">
            {longDate(lang, week.from)} – {longDate(lang, week.to)}
          </span>
        </h2>
        {range && (
          <span className="tip" data-tip={tooMany ? t('ktp.week.tooMany', { max: KTP_MAX_RANGE }) : undefined}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={tooMany || busy === 'week'}
              aria-busy={busy === 'week'}
              onClick={() => void run('week', () => fetchLessonPlans(plan.id, cls, range.from, range.to))}
            >
              <Icon name="download" className="sm" />
              {t('ktp.week.download', { count: lessons.length })}
            </button>
          </span>
        )}
      </div>
      {lessons.length ? (
        <ul className="ktp-week__list">{lessons.map((r) => item(r, r.dates[cls] === today))}</ul>
      ) : (
        <p className="muted">
          {t('ktp.week.empty', { class: cls })}{' '}
          {next
            ? t('ktp.week.next', {
                date: longDate(lang, next.dates[cls]!),
                title: next.title || t('ktp.untitled'),
              })
            : ''}
        </p>
      )}
      {todays.length === 0 && lessons.length > 0 && <p className="muted small">{t('ktp.week.noToday')}</p>}
    </section>
  );
}

function RangeBar({
  plan,
  cls,
  range,
  setRange,
  busy,
  run,
}: {
  plan: TeachingPlan;
  cls: string;
  range: { from: number; to: number } | null;
  setRange: (r: { from: number; to: number } | null) => void;
  busy: string | null;
  run: Run;
}): JSX.Element {
  const { t } = useTranslation();
  const max = plan.rows.length;
  const ok = rangeOk(range) && range.to <= max;
  const set = (from: number, to: number) => {
    const f = Math.min(Math.max(1, from || 1), max);
    const tt = Math.min(Math.max(1, to || f), max);
    setRange({ from: Math.min(f, tt), to: Math.max(f, tt) });
  };
  return (
    <div className="ktp-range" role="group" aria-label={t('ktp.range.title')}>
      <label className="ktp-range__f">
        <span className="small">{t('ktp.range.from')}</span>
        <input className="input" type="number" min={1} max={max} value={range?.from ?? ''} onChange={(e) => set(Number(e.target.value), range?.to ?? Number(e.target.value))} />
      </label>
      <label className="ktp-range__f">
        <span className="small">{t('ktp.range.to')}</span>
        <input className="input" type="number" min={1} max={max} value={range?.to ?? ''} onChange={(e) => set(range?.from ?? Number(e.target.value), Number(e.target.value))} />
      </label>
      <button
        type="button"
        className="btn btn--sm"
        disabled={!ok || busy === 'range'}
        aria-busy={busy === 'range'}
        onClick={() => range && void run('range', () => fetchLessonPlans(plan.id, cls, range.from, range.to))}
      >
        <Icon name="download" className="sm" />
        {range ? t('ktp.range.download', { count: rangeSize(range) }) : t('ktp.range.downloadNone')}
      </button>
      {range && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setRange(null)}>
          {t('ktp.range.clear')}
        </button>
      )}
      <p className={range && !ok ? 'error-text small' : 'muted small'} role={range && !ok ? 'alert' : undefined}>
        {range && !ok ? t('ktp.range.tooMany', { max: KTP_MAX_RANGE }) : t('ktp.range.hint')}
      </p>
    </div>
  );
}
