/**
 * A-01 Dashboard: my drafts (`mine=true`), waiting for review, translation
 * gaps per language, failed builds (`status=failed`), latest publications
 * (server sort by `updatedAt`). Each widget is shown only when the user may
 * call its endpoint.
 */
import { Link } from 'react-router-dom';
import { LANGS, t as tl } from '@bilig/content-model';
import type { AdminTopic } from '@bilig/content-model/api';
import { useApiQuery, useCanCall } from '../api/hooks';
import { useAdminLang, useT } from '../i18n';
import { useAdminPath } from '../shell/base';
import { Icon } from '../lib/icons';
import { EmptyState, ErrorBox, PageHeader, Skeleton, StatusBadge, fmtDate } from '../shell/ui';

type TopicQuery = { status: string; mine?: 'true'; sort?: string; order?: 'asc' | 'desc' };

function TopicWidget({ title, query, icon }: { title: string; query: TopicQuery; icon: string }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const q = useApiQuery('adminTopicList', { query: { ...query, limit: 10 } });
  const items: AdminTopic[] = q.data?.items ?? [];
  return (
    <div className="adm-card">
      <h2 className="adm-card__title">
        <Icon id={icon} />
        <span>{title}</span>
        <span className="adm-count">{q.data ? (q.data.nextCursor && !query.sort ? `${items.length}+` : items.length) : ''}</span>
      </h2>
      <ErrorBox error={q.error} />
      {q.isLoading && <Skeleton lines={4} />}
      <ul className="adm-rows">
        {items.map((tp) => (
          <li key={tp.id}>
            <Link to={to(`topics/${tp.id}`)} className="adm-rows__main">
              <code>{tp.key}</code>
              {tp.title && <span className="adm-muted"> · {tl(tp.title, lang)}</span>}
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
  const q = useApiQuery('adminBuildList', { query: { status: 'failed', sort: 'createdAt', order: 'desc', limit: 10 } });
  const failed = q.data?.items ?? [];
  return (
    <div className="adm-card">
      <h2 className="adm-card__title">
        <Icon id="warn" />
        <span>{t('dashboard.failedBuilds')}</span>
        <span className="adm-count">{q.data ? count(q.data) : ''}</span>
      </h2>
      <ErrorBox error={q.error} />
      {q.isLoading && <Skeleton lines={3} />}
      <ul className="adm-rows">
        {failed.map((b) => (
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

const MY_DRAFTS: TopicQuery = { status: 'draft', mine: 'true' };

const count = (d: { items: unknown[]; nextCursor: string | null } | undefined) => (d ? `${d.items.length}${d.nextCursor ? '+' : ''}` : '…');

function TopicTile({ query, icon, label }: { query: TopicQuery; icon: string; label: string }) {
  const to = useAdminPath();
  const q = useApiQuery('adminTopicList', { query: { ...query, limit: query.status === 'published' ? 100 : 10 } });
  return <StatTile icon={icon} label={label} value={count(q.data)} to={`${to('topics')}?${new URLSearchParams(query)}`} />;
}

function GapTile() {
  const t = useT();
  const to = useAdminPath();
  const q = useApiQuery('adminStrings', { query: { locale: 'ky', untranslated: 'true', limit: 500 } });
  return <StatTile icon="globe" label={t('dashboard.gapsKy')} value={count(q.data)} to={to('translations?locale=ky&untranslated=true')} />;
}

function BuildTile() {
  const t = useT();
  const q = useApiQuery('adminBuildList', { query: { status: 'failed', limit: 100 } });
  return <StatTile icon="warn" label={t('dashboard.failedBuilds')} value={count(q.data)} />;
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
        {canTopics && <TopicTile query={MY_DRAFTS} icon="pencil" label={t('dashboard.drafts')} />}
        {canTopics && <TopicTile query={{ status: 'review' }} icon="a-review" label={t('dashboard.review')} />}
        {canTopics && <TopicTile query={{ status: 'published' }} icon="a-publish" label={t('dashboard.publishedCount')} />}
        {canStrings && <GapTile />}
        {canBuilds && <BuildTile />}
      </div>
      <div className="adm-grid">
        {canTopics && <TopicWidget title={t('dashboard.drafts')} query={MY_DRAFTS} icon="pencil" />}
        {canTopics && <TopicWidget title={t('dashboard.review')} query={{ status: 'review' }} icon="a-review" />}
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
        {canTopics && <TopicWidget title={t('dashboard.published')} query={{ status: 'published', sort: 'updatedAt', order: 'desc' }} icon="a-publish" />}
      </div>
      <p className="adm-hint">{t('dashboard.scopeNote')}</p>
    </section>
  );
}
