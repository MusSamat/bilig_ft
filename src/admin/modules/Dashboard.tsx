/**
 * A-01 Dashboard: drafts, waiting for review, translation gaps per language,
 * failed builds, latest publications. Each widget is shown only when the
 * user may call its endpoint.
 */
import { Link } from 'react-router-dom';
import { LANGS } from '@bilig/content-model';
import type { AdminTopic } from '@bilig/content-model/api';
import { useApiQuery, useCanCall } from '../api/hooks';
import { useAdminLang, useT } from '../i18n';
import { useAdminPath } from '../shell/base';
import { Icon } from '../lib/icons';
import { EmptyState, ErrorBox, PageHeader, Skeleton, StatusBadge, fmtDate } from '../shell/ui';

function TopicWidget({ title, status, sortRecent, icon }: { title: string; status: string; sortRecent?: boolean; icon: string }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const q = useApiQuery('adminTopicList', { query: { status, limit: sortRecent ? 100 : 10 } });
  let items: AdminTopic[] = q.data?.items ?? [];
  if (sortRecent) items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);
  return (
    <div className="adm-card">
      <h2 className="adm-card__title">
        <Icon id={icon} />
        <span>{title}</span>
        <span className="adm-count">{q.data ? (q.data.nextCursor && !sortRecent ? `${items.length}+` : items.length) : ''}</span>
      </h2>
      <ErrorBox error={q.error} />
      {q.isLoading && <Skeleton lines={4} />}
      <ul className="adm-rows">
        {items.map((tp) => (
          <li key={tp.id}>
            <Link to={to(`topics/${tp.id}`)} className="adm-rows__main">
              <code>{tp.key}</code>
            </Link>
            <StatusBadge status={tp.status} />
            <span className="adm-muted adm-rows__meta">{fmtDate(tp.updatedAt, lang)}</span>
          </li>
        ))}
      </ul>
      {q.data && !items.length && <EmptyState title={t('list.empty')} hint={t('dashboard.emptyHint')} />}
    </div>
  );
}

function GapCount({ locale }: { locale: (typeof LANGS)[number] }) {
  const t = useT();
  const to = useAdminPath();
  const q = useApiQuery('adminStrings', { query: { locale, untranslated: 'true', limit: 500 } });
  const n = q.data ? `${q.data.items.length}${q.data.nextCursor ? '+' : ''}` : '…';
  const zero = q.data && !q.data.items.length;
  return (
    <li>
      <Link to={to(`translations?locale=${locale}&untranslated=true`)} className="adm-rows__main">
        <span className="adm-lang-tag">{locale}</span>
        <span>{t('dashboard.untranslated', { n })}</span>
      </Link>
      {zero ? <Icon id="check" size={18} className="adm-ok" /> : <Icon id="next" size={16} className="adm-muted" />}
    </li>
  );
}

function FailedBuilds() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const q = useApiQuery('adminBuildList', { query: { limit: 100 } });
  const failed = (q.data?.items ?? []).filter((b) => b.status === 'failed');
  return (
    <div className="adm-card">
      <h2 className="adm-card__title">
        <Icon id="warn" />
        <span>{t('dashboard.failedBuilds')}</span>
        <span className="adm-count">{q.data ? failed.length : ''}</span>
      </h2>
      <ErrorBox error={q.error} />
      {q.isLoading && <Skeleton lines={3} />}
      <ul className="adm-rows">
        {failed.slice(0, 10).map((b) => (
          <li key={b.id} className="adm-rows--stack">
            <code className="adm-rows__main">
              {b.topicKey}@{b.version}
            </code>
            <span className="adm-muted adm-rows__meta">{fmtDate(b.createdAt, lang)}</span>
            {b.log.length > 0 && <div className="adm-mono adm-muted adm-rows__log">{b.log[b.log.length - 1]}</div>}
          </li>
        ))}
      </ul>
      {q.data && !failed.length && <EmptyState icon="check" title={t('dashboard.noFailed')} />}
    </div>
  );
}

function StatTile({ icon, label, value, to }: { icon: string; label: string; value: string; to?: string }) {
  const body = (
    <>
      <span className="adm-tile__label">
        <Icon id={icon} size={18} />
        {label}
      </span>
      <span className="adm-tile__value">{value}</span>
    </>
  );
  return to ? (
    <Link className="adm-tile" to={to}>
      {body}
    </Link>
  ) : (
    <div className="adm-tile">{body}</div>
  );
}

const count = (d: { items: unknown[]; nextCursor: string | null } | undefined) => (d ? `${d.items.length}${d.nextCursor ? '+' : ''}` : '…');

function TopicTile({ status, icon, label }: { status: string; icon: string; label: string }) {
  const to = useAdminPath();
  const q = useApiQuery('adminTopicList', { query: { status, limit: status === 'published' ? 100 : 10 } });
  return <StatTile icon={icon} label={label} value={count(q.data)} to={`${to('topics')}?status=${status}`} />;
}

function GapTile() {
  const t = useT();
  const to = useAdminPath();
  const q = useApiQuery('adminStrings', { query: { locale: 'ky', untranslated: 'true', limit: 500 } });
  return <StatTile icon="globe" label={t('dashboard.gapsKy')} value={count(q.data)} to={to('translations?locale=ky&untranslated=true')} />;
}

function BuildTile() {
  const t = useT();
  const q = useApiQuery('adminBuildList', { query: { limit: 100 } });
  const failed = (q.data?.items ?? []).filter((b) => b.status === 'failed').length;
  return <StatTile icon="warn" label={t('dashboard.failedBuilds')} value={q.data ? String(failed) : '…'} />;
}

export function Dashboard() {
  const t = useT();
  const to = useAdminPath();
  const canTopics = useCanCall('adminTopicList');
  const canStrings = useCanCall('adminStrings');
  const canBuilds = useCanCall('adminBuildList');
  const canCreate = useCanCall('adminTopicCreate');
  return (
    <section>
      <PageHeader title={t('nav.dashboard')} description={t('pages.dashboard')}>
        {canStrings && (
          <Link className="adm-btn" to={to('translations')}>
            <Icon id="globe" size={18} />
            {t('nav.translations')}
          </Link>
        )}
        {canCreate && (
          <Link className="adm-btn adm-btn--primary" to={to('topics/new')}>
            <Icon id="plus" size={18} />
            {t('dashboard.newTopic')}
          </Link>
        )}
      </PageHeader>
      <div className="adm-tiles">
        {canTopics && <TopicTile status="draft" icon="pencil" label={t('dashboard.drafts')} />}
        {canTopics && <TopicTile status="review" icon="a-review" label={t('dashboard.review')} />}
        {canTopics && <TopicTile status="published" icon="a-publish" label={t('dashboard.publishedCount')} />}
        {canStrings && <GapTile />}
        {canBuilds && <BuildTile />}
      </div>
      <div className="adm-grid">
        {canTopics && <TopicWidget title={t('dashboard.drafts')} status="draft" icon="pencil" />}
        {canTopics && <TopicWidget title={t('dashboard.review')} status="review" icon="a-review" />}
        {canStrings && (
          <div className="adm-card">
            <h2 className="adm-card__title">
              <Icon id="globe" />
              <span>{t('dashboard.gaps')}</span>
            </h2>
            <ul className="adm-rows">
              {LANGS.map((l) => (
                <GapCount key={l} locale={l} />
              ))}
            </ul>
          </div>
        )}
        {canBuilds && <FailedBuilds />}
        {canTopics && <TopicWidget title={t('dashboard.published')} status="published" icon="a-publish" sortRecent />}
      </div>
      <p className="adm-hint">{t('dashboard.scopeNote')}</p>
    </section>
  );
}
