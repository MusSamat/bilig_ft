/**
 * «This week» of a КТП for one class: the school days (Monday … Saturday, and
 * Sunday only when a lesson falls on it) with their lessons as cards — number,
 * topic, section, type, linked Bilig topic and one «Plan (.docx)» button.
 * Previous / next week, «Today», and the plans of the whole week in one file
 * (or a few, at most KTP_MAX_RANGE lessons each).
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import type { KtpRow, TeachingPlan } from '@bilig/content-model/api';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { btn, cx } from '../cabinet/teacher/ui';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { fetchLessonPlan, fetchRangeParts, type useDownloads } from './api';
import { addDays, chunkRange, dayKey, dayMonth, indexRange, isHoliday, lessonProblems, lessonsBetween, nextLesson, prevLesson, todayIso, weekDays, weekOf, weekday } from './model';
import { useIssueText } from './Problems';

type Run = ReturnType<typeof useDownloads>['run'];

/** Bordered round icon button (44×44). */
export const NAV_BTN = 'inline-flex size-11 flex-none items-center justify-center rounded-pill border border-line bg-chip text-ink transition-colors hover:border-accent';

export function WeekView({
  plan,
  cls,
  week,
  onWeek,
  onOpen,
  busy,
  run,
}: {
  plan: TeachingPlan;
  cls: string;
  /** Monday of the week shown. */
  week: string;
  onWeek: (monday: string) => void;
  onOpen: (row: KtpRow) => void;
  busy: string | null;
  run: Run;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const today = todayIso();
  const thisWeek = weekOf(today).from;
  const end = addDays(week, 6);
  const lessons = lessonsBetween(plan, cls, week, end);
  const byDay = new Map<string, KtpRow[]>();
  for (const r of lessons) byDay.set(r.dates[cls]!, [...(byDay.get(r.dates[cls]!) ?? []), r]);
  const days = weekDays(week).filter((d) => weekday(d) !== 0 || byDay.has(d));
  const range = indexRange(lessons);
  const parts = range ? chunkRange(range).length : 0;
  const next = nextLesson(plan, cls, end);
  const prev = prevLesson(plan, cls, week);

  return (
    <section className="grid gap-4" aria-labelledby="ktp-week-title">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={NAV_BTN} aria-label={t('ktp.week.prev')} title={t('ktp.week.prev')} onClick={() => onWeek(addDays(week, -7))}>
          <Icon name="chevron-left" />
        </button>
        <h2 id="ktp-week-title" className="m-0 min-w-0 text-center font-serif text-lg font-bold text-ink" aria-live="polite">
          {dayMonth(lang, week)} – {dayMonth(lang, end)}
        </h2>
        <button type="button" className={NAV_BTN} aria-label={t('ktp.week.next')} title={t('ktp.week.next')} onClick={() => onWeek(addDays(week, 7))}>
          <Icon name="chevron-right" />
        </button>
        <button type="button" className={btn('secondary', 'px-4')} disabled={week === thisWeek} onClick={() => onWeek(thisWeek)}>
          <Icon name="calendar" className="sm" />
          {t('ktp.week.today')}
        </button>
        {range && (
          <div className="grid w-full justify-items-start gap-1 md:ms-auto md:w-auto md:justify-items-end">
            <button
              type="button"
              className={btn('primary')}
              disabled={busy === 'week'}
              aria-busy={busy === 'week'}
              aria-label={t('ktp.week.downloadLabel', { count: lessons.length })}
              onClick={() => void run('week', () => fetchRangeParts(plan.id, cls, range))}
            >
              <Icon name="download" className="sm" />
              {t('ktp.week.download', { count: lessons.length })}
            </button>
            {parts > 1 && <span className="text-sm text-muted">{t('ktp.week.parts', { count: parts })}</span>}
          </div>
        )}
      </div>

      {lessons.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-line px-4 py-8 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
            <Icon name="sun" className="lg" />
          </span>
          <p className="m-0 text-md font-semibold text-ink">{t('ktp.week.empty', { class: cls })}</p>
          <p className="m-0 text-base text-muted">{t('ktp.week.emptyHint')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {prev && (
              <button type="button" className={btn('secondary')} onClick={() => onWeek(weekOf(prev.dates[cls]!).from)}>
                <Icon name="arrow-left" className="sm" />
                {t('ktp.week.goPrev', { date: dayMonth(lang, prev.dates[cls]!) })}
              </button>
            )}
            {next && (
              <button type="button" className={btn('secondary')} onClick={() => onWeek(weekOf(next.dates[cls]!).from)}>
                {t('ktp.week.goNext', { date: dayMonth(lang, next.dates[cls]!) })}
                <Icon name="arrow-right" className="sm" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <ol className="m-0 grid list-none gap-5 p-0">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const isToday = d === today;
            return (
              <li key={d} className="grid gap-2" aria-labelledby={`ktp-day-${d}`} data-testid={`ktp-day-${d}`}>
                <h3 id={`ktp-day-${d}`} className={cx('m-0 flex flex-wrap items-center gap-2 text-md font-semibold', isToday ? 'text-accent' : 'text-ink')}>
                  {t(dayKey(d))}
                  <span className="font-normal text-muted">{dayMonth(lang, d)}</span>
                  {isToday && <span className="inline-flex min-h-7 items-center rounded-pill bg-accent px-3 text-sm font-semibold text-on">{t('ktp.week.today')}</span>}
                </h3>
                {items.length ? (
                  items.map((r) => <LessonCard key={r.index} plan={plan} row={r} cls={cls} today={isToday} onOpen={onOpen} busy={busy} run={run} />)
                ) : (
                  <p className="m-0 rounded-lg border border-dashed border-line px-4 py-3 text-base text-muted">
                    {isHoliday(d) ? t('ktp.week.holiday') : t('ktp.week.noLessons')}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LessonCard({ plan, row, cls, today, onOpen, busy, run }: { plan: TeachingPlan; row: KtpRow; cls: string; today: boolean; onOpen: (r: KtpRow) => void; busy: string | null; run: Run }): JSX.Element {
  const { t } = useTranslation();
  const problems = lessonProblems(plan.issues, row.index, cls);
  const issueText = useIssueText();
  const key = `row-${row.index}`;
  const title = row.title || t('ktp.lesson.untitled');
  return (
    <article className={cx('flex flex-wrap items-center gap-3 rounded-lg border p-4', today ? 'border-accent bg-soft' : 'border-line bg-chip')} aria-label={t('ktp.lesson.n', { n: row.index })}>
      <div className="grid min-w-0 flex-1 basis-64 gap-2">
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 rounded-md border-0 bg-transparent p-0 text-start text-md font-semibold text-ink hover:underline"
          aria-label={t('ktp.lesson.open', { n: row.index, title })}
          onClick={() => onOpen(row)}
        >
          <span className="inline-flex min-w-9 flex-none justify-center rounded-pill bg-panel px-2 text-sm font-bold text-muted">{row.index}</span>
          <span className="min-w-0">{title}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <TypeBadge type={row.type} />
          {row.section?.title && <span className="min-w-0">{row.section.title}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TopicChip topicKey={row.topicKey} />
        </div>
        {problems.map((i, n) => (
          <p key={n} className={cx('m-0 flex items-start gap-1 text-sm font-semibold', i.severity === 'error' ? 'text-bad' : 'text-ink')}>
            <Icon name={i.severity === 'error' ? 'warn' : 'info'} className="sm mt-0.5 flex-none" />
            {issueText(i)}
          </p>
        ))}
      </div>
      <button
        type="button"
        className={btn(today ? 'primary' : 'secondary')}
        disabled={busy === key}
        aria-busy={busy === key}
        aria-label={t('ktp.action.planFor', { n: row.index, class: cls })}
        onClick={() => void run(key, () => fetchLessonPlan(plan.id, row.index, cls))}
      >
        <Icon name="download" className="sm" />
        {t('ktp.action.plan')}
      </button>
    </article>
  );
}

export function TypeBadge({ type }: { type: KtpRow['type'] }): JSX.Element {
  const { t } = useTranslation();
  return (
    <span className={cx('inline-flex min-h-7 items-center rounded-pill border px-3 text-sm font-semibold', type === 'test' ? 'border-accent text-accent' : 'border-line text-ink')}>
      {t(`ktp.type.${type}`)}
    </span>
  );
}

/** The linked Bilig topic as a link chip, or a plain «No Bilig topic». */
export function TopicChip({ topicKey }: { topicKey: string | null }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  if (!topicKey) return <span className="text-sm text-muted">{t('ktp.lesson.noTopic')}</span>;
  const topic = catalog?.topics.find((x) => x.key === topicKey);
  const title = topic ? tr(topic.title, lang) : topicKey;
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-panel px-4 text-sm font-semibold text-accent no-underline hover:border-accent"
      to={topicPath(catalog, lang, topicKey)}
      aria-label={t('ktp.topic.open', { title })}
    >
      <Icon name="cube" className="sm" />
      {title}
    </Link>
  );
}
