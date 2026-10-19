/**
 * Teacher dashboard → «Сабак пландары / Планы уроков» (contract 0.5.0,
 * `lesson.plan`): upload a КТП (.docx) and the list of the teacher's plans.
 * Lazy chunk of the teacher page.
 */
import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TeachingPlanSummary } from '@bilig/content-model/api';
import { Icon } from '../components/Icon';
import { errorKey, formatDate } from '../cabinet/format';
import { useLang } from '../lib/hooks';
import { toast } from '../state/ui';
import { KtpFileError, useKtpDelete, useKtpList, useKtpUpload } from './api';
import { KTP_MAX_BYTES, checkKtpFile } from './model';

const MB = Math.round(KTP_MAX_BYTES / (1024 * 1024));

export default function KtpTab(): JSX.Element {
  const { t } = useTranslation();
  const list = useKtpList();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="stack ktp">
      <UploadCard />
      <section className="card stack" aria-labelledby="ktp-list-title" aria-busy={list.isLoading}>
        <h2 id="ktp-list-title" className="panel-title">
          <Icon name="cal" />
          {t('ktp.list.title')}
        </h2>
        {list.isLoading && (
          <div className="stack" aria-label={t('common.loading')}>
            <span className="skel" style={{ height: 76 }} />
            <span className="skel" style={{ height: 76 }} />
          </div>
        )}
        {list.isError && (
          <div className="state state--error" role="alert">
            <Icon name="warn" />
            <b>{t('ktp.list.loadError')}</b>
            <button type="button" className="btn2" onClick={() => void list.refetch()}>
              <Icon name="reset" className="sm" />
              {t('common.retry')}
            </button>
          </div>
        )}
        {list.isSuccess && items.length === 0 && (
          <div className="state">
            <Icon name="file" />
            <span>{t('ktp.list.empty')}</span>
          </div>
        )}
        {items.length > 0 && (
          <ul className="ktp-list">
            {items.map((p) => (
              <PlanItem key={p.id} plan={p} />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div>
            <button type="button" className="btn btn--sm" onClick={() => void list.fetchNextPage()}>
              {t('teacher.loadMore')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function UploadCard(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const upload = useKtpUpload();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const start = (file: File | undefined) => {
    if (!file || upload.isPending) return;
    const bad = checkKtpFile(file);
    setError(bad ? t(bad, { mb: MB }) : null);
    if (bad) return;
    upload.mutate(
      { file },
      {
        onSuccess: (plan) => {
          toast({
            key: 'ktp.upload.done',
            params: { title: plan.title || plan.sourceName },
            kind: 'success',
          });
          navigate(`/${lang}/teacher/ktp/${plan.id}`);
        },
        onError: (e) => setError(e instanceof KtpFileError ? t(e.i18nKey, { mb: MB }) : t(errorKey(e))),
      },
    );
    if (input.current) input.current.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    start(e.dataTransfer.files?.[0]);
  };

  return (
    <section className="card stack ktp-upload" aria-labelledby="ktp-upload-title">
      <div>
        <h2 id="ktp-upload-title" className="h2">
          {t('ktp.promise')}
        </h2>
        <p className="muted">{t('ktp.intro')}</p>
      </div>
      <div
        className="ktp-drop"
        data-over={over || undefined}
        aria-busy={upload.isPending}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" className="lg" />
        {upload.isPending ? (
          <p role="status" className="ktp-drop__busy">
            <span className="ktp-spin" aria-hidden="true" />
            {t('ktp.upload.sending')}
          </p>
        ) : (
          <>
            <label className="btn btn--primary">
              <Icon name="file" className="sm" />
              {t('ktp.upload.button')}
              <input
                ref={input}
                className="visually-hidden"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                aria-label={t('ktp.upload.inputLabel')}
                onChange={(e) => start(e.target.files?.[0])}
              />
            </label>
            <span className="muted small">{t('ktp.upload.drop')}</span>
          </>
        )}
        <span className="muted small">{t('ktp.upload.hint', { mb: MB })}</span>
      </div>
      <p className="error-text" role="alert">
        {error ?? ''}
      </p>
    </section>
  );
}

function PlanItem({ plan }: { plan: TeachingPlanSummary }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const del = useKtpDelete();
  const [confirm, setConfirm] = useState(false);
  const title = plan.title || plan.subjectName;
  return (
    <li className="ktp-item">
      <div className="ktp-item__main">
        <Link className="ktp-item__title" to={`/${lang}/teacher/ktp/${plan.id}`} aria-label={t('ktp.list.open', { title })}>
          {title}
        </Link>
        <span className="muted small">
          {[plan.subjectName, plan.grade ? t('teacher.gradeN', { n: plan.grade }) : null, t('ktp.list.classes', { list: plan.classes.join(', ') }), t('ktp.list.lessons', { count: plan.lessons })]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="chips">
          {plan.errors > 0 && (
            <span className="pill pill--bad">
              <Icon name="warn" className="sm" />
              {t('ktp.issues.errors', { count: plan.errors })}
            </span>
          )}
          {plan.warnings > 0 && (
            <span className="pill ktp-pill--warn">
              <Icon name="info" className="sm" />
              {t('ktp.issues.warnings', { count: plan.warnings })}
            </span>
          )}
          {plan.errors === 0 && plan.warnings === 0 && (
            <span className="badge badge--ok">
              <Icon name="check" className="sm" />
              {t('ktp.issues.none')}
            </span>
          )}
          <span className="muted small">{t('ktp.list.updated', { date: formatDate(lang, plan.updatedAt) })}</span>
        </span>
      </div>
      {confirm ? (
        <div className="ktp-item__confirm" role="group" aria-label={t('ktp.list.confirmDelete', { title })}>
          <span className="small">{t('ktp.list.confirmDelete', { title })}</span>
          <button
            type="button"
            className="btn btn--sm ktp-danger"
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
          <button type="button" className="btn btn--sm" onClick={() => setConfirm(false)} autoFocus>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className="icon-btn" aria-label={t('ktp.list.delete', { title })} onClick={() => setConfirm(true)}>
          <Icon name="trash" />
        </button>
      )}
    </li>
  );
}
