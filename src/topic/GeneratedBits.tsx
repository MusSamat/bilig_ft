/**
 * Shared bits for AI-generated material (contract 0.4.0): the «ИИ» badge
 * every generated item carries, the teacher's verdict buttons («Хороший
 * пример» / «Пожаловаться» with a reason), and the «Ещё…» button with its
 * loading, exhausted and error states.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GENERATED_REPORT_REASONS, type GeneratedReportReason } from '@bilig/content-model/api';
import { Icon } from '../components/Icon';
import { useOnline } from '../lib/hooks';
import { useGeneratedStore, vote } from './generated';

export function AiBadge({ reviewed }: { reviewed?: boolean }): JSX.Element {
  const { t } = useTranslation();
  return (
    <span className={`ai-b${reviewed ? ' ai-b--ok' : ''}`} title={t(reviewed ? 'gen.reviewedHint' : 'gen.aiHint')}>
      <Icon name={reviewed ? 'check' : 'wand'} size={12} />
      {t(reviewed ? 'gen.reviewed' : 'gen.ai')}
    </span>
  );
}

/** v0.9.1: the grades a generated item suits («6–8 кл.»): the pool shares it between those grades. */
export function GradesBadge({ grades }: { grades?: { from: number; to: number } }): JSX.Element | null {
  const { t } = useTranslation();
  if (!grades) return null;
  const label = grades.from === grades.to ? String(grades.from) : `${grades.from}–${grades.to}`;
  return (
    <span className="rounded-pill border border-line px-2 text-sm text-muted" title={t('gen.gradesHint')}>
      {t('gen.grades', { grades: label })}
    </span>
  );
}

export function FeedbackButtons({ id }: { id: string }): JSX.Element {
  const { t } = useTranslation();
  const current = useGeneratedStore((s) => s.votes[id]);
  const [reporting, setReporting] = useState(false);
  return (
    <span className="gen-fb">
      <button type="button" className="gen-fb__btn" aria-pressed={current === 'good'} disabled={!!current} onClick={() => void vote(id, 'good')} title={t('gen.good')} aria-label={t('gen.good')}>
        <Icon name="thumb" size={14} />
      </button>
      <button type="button" className="gen-fb__btn" aria-expanded={reporting} disabled={!!current} onClick={() => setReporting((v) => !v)} title={t('gen.report')} aria-label={t('gen.report')}>
        <Icon name="flag" size={14} />
      </button>
      {reporting && (
        <span className="gen-fb__reasons" role="group" aria-label={t('gen.reportWhy')}>
          {GENERATED_REPORT_REASONS.map((r: GeneratedReportReason) => (
            <button key={r} type="button" className="chip sm" onClick={() => void vote(id, 'bad', r)}>
              {t(`gen.reason.${r}`)}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function MoreButton({ label, loading, exhausted, errorKey, onClick }: { label: string; loading: boolean; exhausted: boolean; errorKey?: string; onClick(): void }): JSX.Element {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <div className="gen-more">
      <button type="button" className="btn2" onClick={onClick} disabled={loading || exhausted || !online} aria-busy={loading}>
        <Icon name="wand" className="sm" />
        {loading ? t('gen.loading') : exhausted ? t('gen.exhausted') : label}
      </button>
      {errorKey && (
        <span className="gen-more__err" role="alert">
          <Icon name="warn" className="sm" />
          {t(errorKey)}
        </span>
      )}
    </div>
  );
}
