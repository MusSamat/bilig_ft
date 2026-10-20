/**
 * Teacher cabinet → «Сабак пландары (КТП)» (contract 0.5.0, `lesson.plan`):
 * the teacher's plans with one problem count each, and «Add a КТП» as a
 * guided flow (choose → checking → summary → done). With no plan yet, the
 * flow is the whole section. Lazy chunk of the teacher page.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { KtpIssue, TeachingPlan, TeachingPlanSummary } from '@bilig/content-model/api';
import { Icon } from '../components/Icon';
import { errorKey, formatDate } from '../cabinet/format';
import { Card, CardTitle, ErrorState, Loading, btn, cx, iconBtn } from '../cabinet/teacher/ui';
import { useLang } from '../lib/hooks';
import { toast } from '../state/ui';
import { useKtpDelete, useKtpList } from './api';
import { capitalize, fixTarget } from './model';
import { ProblemCount } from './Problems';
import { UploadFlow } from './UploadFlow';

export default function KtpTab(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const list = useKtpList();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const [adding, setAdding] = useState(false);
  const empty = list.isSuccess && items.length === 0;

  const open = (plan: TeachingPlan, search?: Record<string, string> | null) => navigate({ pathname: `/${lang}/teacher/ktp/${plan.id}`, search: search ? `?${new URLSearchParams(search)}` : '' });
  const flow = (
    <UploadFlow
      onStart={() => setAdding(true)}
      onDone={(p) => open(p)}
      onFix={(p, i: KtpIssue) => open(p, fixTarget(i))}
      onCancel={empty ? undefined : () => setAdding(false)}
    />
  );

  return (
    <div className="grid gap-6">
      {(adding || empty) && (
        <Card labelledBy="ktp-add-title" className="grid gap-5">
          <div className="grid gap-2">
            <CardTitle id="ktp-add-title" icon="upload">
              {t('ktp.upload.title')}
            </CardTitle>
            <p className="m-0 max-w-[64ch] text-base text-muted">{t('ktp.intro')}</p>
          </div>
          {empty && <Steps />}
          {flow}
        </Card>
      )}
      {!empty && (
        <Card labelledBy="ktp-list-title" className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle id="ktp-list-title" icon="cal">
              {t('ktp.list.title')}
            </CardTitle>
            {!adding && list.isSuccess && (
              <button type="button" className={btn('primary')} onClick={() => setAdding(true)}>
                <Icon name="plus" className="sm" />
                {t('ktp.add')}
              </button>
            )}
          </div>
          {list.isLoading && <Loading rows={2} />}
          {list.isError && <ErrorState text={t('ktp.list.loadError')} onRetry={() => void list.refetch()} />}
          {items.length > 0 && (
            <ul className="m-0 grid list-none gap-3 p-0">
              {items.map((p) => (
                <PlanItem key={p.id} plan={p} />
              ))}
            </ul>
          )}
          {list.hasNextPage && (
            <button type="button" className={btn('secondary', 'justify-self-start')} onClick={() => void list.fetchNextPage()}>
              {t('teacher.loadMore')}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function Steps(): JSX.Element {
  const { t } = useTranslation();
  return (
    <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3" aria-label={t('ktp.steps.label')}>
      {(['one', 'two', 'three'] as const).map((k, i) => (
        <li key={k} className="flex items-center gap-3 rounded-lg bg-soft p-3 text-base text-ink">
          <span className="inline-flex size-8 flex-none items-center justify-center rounded-pill bg-accent font-bold text-on" aria-hidden="true">
            {i + 1}
          </span>
          {t(`ktp.steps.${k}`)}
        </li>
      ))}
    </ol>
  );
}

function PlanItem({ plan }: { plan: TeachingPlanSummary }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const del = useKtpDelete();
  const [confirm, setConfirm] = useState(false);
  const heading = [capitalize(plan.subjectName || plan.title, lang), plan.grade ? t('teacher.gradeN', { n: plan.grade }) : null].filter(Boolean).join(' · ');
  const title = plan.title || heading;
  const to = `/${lang}/teacher/ktp/${plan.id}`;
  return (
    <li className="grid gap-3 rounded-lg border border-line bg-chip p-4" data-testid="ktp-plan-item">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 basis-60 gap-1">
          <h3 className="m-0 text-lg font-semibold text-ink">
            <Link to={to} className="text-ink no-underline hover:underline">
              {heading}
            </Link>
          </h3>
          <p className="m-0 text-base text-muted">{[t('ktp.plan.lessons', { count: plan.lessons }), plan.classes.join(', '), t('ktp.list.updated', { date: formatDate(lang, plan.updatedAt) })].join(' · ')}</p>
          <p className="m-0 line-clamp-1 text-sm text-muted" title={plan.title}>
            {plan.title}
          </p>
        </div>
        <ProblemCount errors={plan.errors} warnings={plan.warnings} />
      </div>
      {confirm ? (
        <div className="grid gap-3 rounded-lg border border-bad p-3" role="group" aria-label={t('ktp.list.delete', { title })}>
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
                    onSuccess: () => toast({ key: 'ktp.list.deleted', kind: 'success' }),
                    onError: (e) => {
                      setConfirm(false);
                      toast({ key: errorKey(e), kind: 'error' });
                    },
                  },
                )
              }
            >
              <Icon name="trash" className="sm" />
              {t('common.delete')}
            </button>
            <button type="button" className={btn('secondary')} onClick={() => setConfirm(false)} autoFocus>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Link className={btn('primary')} to={to} aria-label={t('ktp.list.openLabel', { title: heading })}>
            {t('ktp.list.open')}
            <Icon name="arrow-right" className="sm" />
          </Link>
          <button type="button" className={cx(iconBtn(), 'ms-auto')} aria-label={t('ktp.list.delete', { title: heading })} title={t('ktp.list.delete', { title: heading })} onClick={() => setConfirm(true)}>
            <Icon name="trash" />
          </button>
        </div>
      )}
    </li>
  );
}
