/**
 * What the КТП checker found, in plain words: one count chip (errors +
 * warnings of the whole plan — the same numbers on the list, the upload
 * summary and the plan page) and a list with errors first, each saying what
 * is wrong, what to do, and a «Fix» button that opens the lesson.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KtpIssue, KtpRow } from '@bilig/content-model/api';
import { Icon } from '../components/Icon';
import { btn, cx } from '../cabinet/teacher/ui';
import { fixTarget, issueParams, sortProblems } from './model';

/** Localized message of an issue («КТПда «31.04.27» деп жазылган — мындай күн жок.»). */
export function useIssueText() {
  const { t } = useTranslation();
  return (i: KtpIssue) => t(`ktp.issue.${i.code}`, issueParams(i));
}

/** «1 ката · 5 эскертүү» / «Көйгөй жок». */
export function ProblemCount({ errors, warnings, className }: { errors: number; warnings: number; className?: string }): JSX.Element {
  const { t } = useTranslation();
  const none = errors + warnings === 0;
  const text = none ? t('ktp.count.none') : [errors && t('ktp.count.errors', { count: errors }), warnings && t('ktp.count.warnings', { count: warnings })].filter(Boolean).join(' · ');
  return (
    <span
      data-testid="ktp-count"
      className={cx(
        'inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 text-sm font-semibold',
        none ? 'border-ok text-ok' : errors ? 'border-bad text-bad' : 'border-gold bg-chip text-ink',
        className,
      )}
    >
      <Icon name={none ? 'check' : errors ? 'warn' : 'info'} className="sm" />
      {text}
    </span>
  );
}

export function ProblemList({ issues, rows, onFix, warningsShown }: { issues: KtpIssue[]; rows: KtpRow[]; onFix: (i: KtpIssue) => void; warningsShown?: number }): JSX.Element {
  const { t } = useTranslation();
  const sorted = sortProblems(issues);
  const errors = sorted.filter((i) => i.severity === 'error');
  const warnings = sorted.filter((i) => i.severity === 'warning');
  const [all, setAll] = useState(false);
  const limit = all ? warnings.length : (warningsShown ?? (errors.length ? 0 : 3));
  const hidden = warnings.length - Math.min(limit, warnings.length);
  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-3 p-0">
        {[...errors, ...warnings.slice(0, limit)].map((i, n) => (
          <ProblemItem key={`${i.code}-${i.row ?? 0}-${i.class ?? ''}-${n}`} issue={i} row={rows.find((r) => r.index === i.row)} onFix={onFix} />
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className={btn('ghost', 'justify-self-start px-3')} onClick={() => setAll(true)}>
          <Icon name="chevron-down" className="sm" />
          {t('ktp.problems.moreWarnings', { count: hidden })}
        </button>
      )}
    </div>
  );
}

function ProblemItem({ issue, row, onFix }: { issue: KtpIssue; row?: KtpRow; onFix: (i: KtpIssue) => void }): JSX.Element {
  const { t } = useTranslation();
  const text = useIssueText()(issue);
  const error = issue.severity === 'error';
  const where =
    issue.row === undefined || issue.code === 'section_hours_mismatch'
      ? issue.row === undefined
        ? t('ktp.problems.wholePlan')
        : null
      : issue.class
        ? t('ktp.problems.lessonOf', { n: issue.row, class: issue.class })
        : t('ktp.problems.lesson', { n: issue.row });
  const canFix = fixTarget(issue) !== null;
  return (
    <li className={cx('grid gap-3 rounded-lg border bg-chip p-4 md:flex md:items-center', error ? 'border-bad' : 'border-line border-l-4 border-l-gold')}>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          <span className={cx('inline-flex items-center gap-1', error ? 'text-bad' : 'text-ink')}>
            <Icon name={error ? 'warn' : 'info'} className="sm" />
            {t(error ? 'ktp.problems.error' : 'ktp.problems.warning')}
          </span>
          {where && <span className="text-muted">{where}</span>}
          {row?.title && issue.code !== 'section_hours_mismatch' && <span className="min-w-0 truncate font-normal text-muted">«{row.title}»</span>}
        </p>
        <p className="m-0 text-base text-ink">{text}</p>
        <p className="m-0 text-sm text-muted">{t(`ktp.fix.${issue.code}`)}</p>
      </div>
      {canFix && (
        <button type="button" className={btn('secondary', 'flex-none justify-self-start')} aria-label={t('ktp.problems.fixLabel', { what: [where, text].filter(Boolean).join(' — ') })} onClick={() => onFix(issue)}>
          <Icon name="pencil" className="sm" />
          {t('ktp.problems.fix')}
        </button>
      )}
    </li>
  );
}
