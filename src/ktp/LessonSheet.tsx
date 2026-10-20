/**
 * Edit one КТП lesson in a side sheet (full screen on phones): the problems
 * of this lesson, its topic, a date for every class (dd.mm.yyyy, with the
 * long date in the UI language), type, hours, homework and the linked Bilig
 * topic. Nothing is sent until «Save»; then one PATCH row with only the
 * changed fields (If-Match, conflicts handled by useKtpPatch).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { KTP_LESSON_TYPES, type KtpLessonType, type KtpRow, type KtpRowPatch, type TeachingPlan } from '@bilig/content-model/api';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { btn, cx, iconBtn, inputCls } from '../cabinet/teacher/ui';
import { useFocusTrap, useKeydown, useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { dayKey, fromDmy, fullDate, isHoliday, lessonProblems, rowDiff, toDmy, weekday } from './model';
import { useIssueText } from './Problems';
import { TopicPicker } from './TopicPicker';
import { NAV_BTN } from './WeekView';

export function LessonSheet({
  plan,
  row,
  cls,
  focusClass,
  busy,
  onSave,
  onDownload,
  onClose,
}: {
  plan: TeachingPlan;
  row: KtpRow;
  /** The class the page shows (its plan is the one the footer downloads). */
  cls: string;
  /** Focus this class's date on open (from a «Fix» action). */
  focusClass?: string | null;
  busy: boolean;
  onSave: (patch: KtpRowPatch) => void;
  onDownload: () => void;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const issueText = useIssueText();
  const { data: catalog } = useCatalog();
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [title, setTitle] = useState(row.title);
  const [type, setType] = useState<KtpLessonType>(row.type);
  const [hours, setHours] = useState(String(row.hours));
  const [homework, setHomework] = useState(row.homework);
  const [topicKey, setTopicKey] = useState(row.topicKey);
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(plan.classes.map((c) => [c, toDmy(row.dates[c])])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState(false);

  useFocusTrap(ref, true);
  useKeydown((e) => e.key === 'Escape' && onClose(), { allowInInputs: true });
  useEffect(() => {
    const target = focusClass ? ref.current?.querySelector<HTMLElement>(`[data-date-class="${CSS.escape(focusClass)}"]`) : null;
    (target ?? ref.current)?.focus();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problems = lessonProblems(plan.issues, row.index);
  const notes = plan.issues.filter((i) => i.row === row.index && i.severity === 'info');
  const topic = topicKey ? catalog?.topics.find((x) => x.key === topicKey) : undefined;
  const topicTitle = topic ? tr(topic.title, lang) : topicKey;

  const save = () => {
    const isoDates: Record<string, string | null> = {};
    const bad: Record<string, string> = {};
    for (const c of plan.classes) {
      const v = fromDmy(dates[c] ?? '');
      if (v === undefined) bad[c] = t('ktp.sheet.dateFormat');
      else isoDates[c] = v;
    }
    setErrors(bad);
    if (Object.keys(bad).length) {
      ref.current?.querySelector<HTMLElement>(`[data-date-class="${CSS.escape(Object.keys(bad)[0])}"]`)?.focus();
      return;
    }
    const h = Math.min(10, Math.max(0, Math.round(Number(hours) || 0)));
    const patch = rowDiff(row, { title: title.trim(), type, hours: h, homework: homework.trim(), topicKey, dates: isoDates });
    if (patch) onSave(patch);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink opacity-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-g3 shadow-panel outline-none md:max-w-130 md:border-s md:border-edge"
      >
        <header className="flex items-start gap-3 border-b border-line p-4 md:px-6">
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="m-0 text-sm font-semibold text-muted">
              {[t('ktp.lesson.n', { n: row.index }), row.section?.title].filter(Boolean).join(' · ')}
            </p>
            <h2 id={`${uid}-title`} className="m-0 font-serif text-xl font-bold text-ink">
              {row.title || t('ktp.lesson.untitled')}
            </h2>
          </div>
          <button type="button" className={iconBtn('-me-2')} onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="x" />
          </button>
        </header>

        <form
          id={`${uid}-form`}
          className="grid flex-1 content-start gap-6 overflow-y-auto p-4 md:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {(problems.length > 0 || notes.length > 0) && (
            <section className="grid gap-2" aria-label={t('ktp.sheet.problemsHere')}>
              {problems.map((i, n) => (
                <div key={n} className={cx('grid gap-1 rounded-lg border bg-chip p-3', i.severity === 'error' ? 'border-bad' : 'border-line border-l-4 border-l-gold')}>
                  <p className={cx('m-0 flex items-center gap-1 text-sm font-semibold', i.severity === 'error' ? 'text-bad' : 'text-ink')}>
                    <Icon name={i.severity === 'error' ? 'warn' : 'info'} className="sm" />
                    {[t(i.severity === 'error' ? 'ktp.problems.error' : 'ktp.problems.warning'), i.class].filter(Boolean).join(' · ')}
                  </p>
                  <p className="m-0 text-base text-ink">{issueText(i)}</p>
                  <p className="m-0 text-sm text-muted">{t(`ktp.fix.${i.code}`)}</p>
                </div>
              ))}
              {notes.map((i, n) => (
                <p key={`n${n}`} className="m-0 text-sm text-muted">
                  {t('ktp.sheet.noteHere')}: {issueText(i)}
                </p>
              ))}
            </section>
          )}

          <div className="grid gap-1.5">
            <label htmlFor={`${uid}-t`} className="text-sm font-semibold text-ink">
              {t('ktp.sheet.lessonTitle')}
            </label>
            <textarea id={`${uid}-t`} className={cx(inputCls, 'py-2.5')} rows={2} maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <fieldset className="m-0 grid gap-4 border-0 p-0">
            <legend className="mb-3 p-0 text-md font-semibold text-ink">{t('ktp.sheet.dates')}</legend>
            {plan.classes.map((c) => (
              <DateField key={c} cls={c} value={dates[c] ?? ''} error={errors[c] ?? null} onChange={(v) => setDates((d) => ({ ...d, [c]: v }))} />
            ))}
          </fieldset>

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-3 p-0 text-md font-semibold text-ink">{t('ktp.type.label')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KTP_LESSON_TYPES.map((k) => (
                <label
                  key={k}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-base transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                    type === k ? 'border-accent bg-soft font-semibold text-ink' : 'border-line bg-chip text-ink hover:border-accent',
                  )}
                >
                  <input type="radio" name={`${uid}-type`} value={k} checked={type === k} onChange={() => setType(k)} className="size-5 accent-[var(--accent)]" />
                  {t(`ktp.type.${k}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-[minmax(0,8rem)] gap-1.5">
            <label htmlFor={`${uid}-h`} className="text-sm font-semibold text-ink">
              {t('ktp.sheet.hours')}
            </label>
            <input id={`${uid}-h`} type="number" inputMode="numeric" min={0} max={10} className={inputCls} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor={`${uid}-hw`} className="text-sm font-semibold text-ink">
              {t('ktp.sheet.homework')}
            </label>
            <textarea
              id={`${uid}-hw`}
              className={cx(inputCls, 'py-2.5')}
              rows={3}
              maxLength={1000}
              placeholder={t('ktp.sheet.homeworkPlaceholder')}
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
            />
          </div>

          <section className="grid gap-3" aria-labelledby={`${uid}-topic`}>
            <h3 id={`${uid}-topic`} className="m-0 text-md font-semibold text-ink">
              {t('ktp.sheet.topic')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {topicKey ? (
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-chip px-4 text-base font-semibold text-accent no-underline hover:border-accent"
                  to={topicPath(catalog, lang, topicKey)}
                  aria-label={t('ktp.topic.open', { title: topicTitle })}
                >
                  <Icon name="cube" className="sm" />
                  {topicTitle}
                </Link>
              ) : (
                <span className="text-base text-muted">{t('ktp.lesson.noTopic')}</span>
              )}
              {!picking && (
                <button type="button" className={btn('secondary')} onClick={() => setPicking(true)}>
                  <Icon name={topicKey ? 'pencil' : 'link'} className="sm" />
                  {t(topicKey ? 'ktp.topic.change' : 'ktp.topic.choose')}
                </button>
              )}
            </div>
            {topicKey && topicKey === row.topicKey && row.match?.auto && <p className="m-0 text-sm text-muted">{t('ktp.sheet.topicAuto')}</p>}
            {picking && (
              <TopicPicker
                lessonTitle={title}
                current={topicKey}
                subjectKey={plan.subjectKey}
                onClose={() => setPicking(false)}
                onPick={(key) => {
                  setTopicKey(key);
                  setPicking(false);
                }}
              />
            )}
          </section>
        </form>

        <footer className="flex flex-wrap items-center gap-3 border-t border-line p-4 md:px-6">
          <button type="submit" form={`${uid}-form`} className={btn('primary')}>
            <Icon name="check" className="sm" />
            {t('ktp.sheet.save')}
          </button>
          <button type="button" className={btn('secondary')} onClick={onClose}>
            {t('ktp.sheet.cancel')}
          </button>
          {cls && (
            <button
              type="button"
              className={btn('ghost', 'ms-auto px-3')}
              disabled={busy}
              aria-busy={busy}
              aria-label={t('ktp.action.planFor', { n: row.index, class: cls })}
              onClick={onDownload}
            >
              <Icon name="download" className="sm" />
              {t('ktp.action.plan')}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function DateField({ cls, value, error, onChange }: { cls: string; value: string; error: string | null; onChange: (v: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const iso = fromDmy(value);
  const day = typeof iso === 'string' ? weekday(iso) : null;
  const desc = typeof iso === 'string' ? `${t(dayKey(iso))}, ${fullDate(lang, iso)}` : iso === null ? t('ktp.sheet.noDate') : '';
  const warn = typeof iso === 'string' ? (day === 0 ? t('ktp.issue.date_sunday', { date: value }) : isHoliday(iso) ? t('ktp.issue.date_holiday', { date: value }) : '') : '';
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {t('ktp.sheet.dateFor', { class: cls })}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          data-date-class={cls}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={cx(inputCls, 'max-w-48')}
          placeholder={t('ktp.sheet.datePlaceholder')}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-d ${id}-e`}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="relative inline-flex">
          <button
            type="button"
            className={NAV_BTN}
            aria-label={t('ktp.sheet.pickDate', { class: cls })}
            title={t('ktp.sheet.pickDate', { class: cls })}
            onClick={() => {
              const el = picker.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.click();
              }
            }}
          >
            <Icon name="calendar" />
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0"
            value={typeof iso === 'string' ? iso : ''}
            onChange={(e) => onChange(toDmy(e.target.value))}
          />
        </span>
      </div>
      <span id={`${id}-d`} className="text-sm text-muted">
        {desc}
        {warn && <span className="block font-semibold text-bad">{warn}</span>}
      </span>
      <span id={`${id}-e`} role="alert" className="text-sm font-semibold text-bad empty:hidden">
        {error ?? ''}
      </span>
    </div>
  );
}
