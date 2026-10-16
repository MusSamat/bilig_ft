/** Topic list (server filters q / subjectKey / status in the URL) and topic creation. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONTENT_STATUSES } from '@bilig/content-model';
import { AdminTopicCreateSchema, type AdminTopic } from '@bilig/content-model/api';
import { useApiMutation, useCanCall } from '../../api/hooks';
import { api } from '../../api/session';
import { SchemaForm, useValidation } from '../../forms/SchemaForm';
import { useAdminLang, useT } from '../../i18n';
import { useSuggestions } from '../../lib/suggest';
import { ListView, type BulkAction, type Column } from '../../lists/ListView';
import { useListParams } from '../../lists/useListParams';
import { useAdminPath } from '../../shell/base';
import { ErrorBox, FilterSelect, FilterText, PageHeader, StatusBadge, fmtDate } from '../../shell/ui';
import { SubjectFilter } from '../ResourcePages';
import { Icon } from '../../lib/icons';
import { navIcon } from '../../shell/Layout';

export function topicColumns(t: ReturnType<typeof useT>, lang: string): Column<AdminTopic>[] {
  return [
    { key: 'key', header: t('fields.key'), render: (r) => <code>{r.key}</code>, sortValue: (r) => r.key },
    { key: 'unitKey', header: t('fields.unitKey'), render: (r) => r.unitKey, sortValue: (r) => r.unitKey },
    { key: 'status', header: t('fields.status'), render: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
    { key: 'publishedVersion', header: t('topics.published'), render: (r) => r.publishedVersion ?? '—', sortValue: (r) => r.publishedVersion },
    { key: 'latestVersion', header: t('topics.latest'), render: (r) => r.latestVersion ?? '—', sortValue: (r) => r.latestVersion },
    { key: 'updatedAt', header: t('fields.updatedAt'), render: (r) => fmtDate(r.updatedAt, lang), sortValue: (r) => r.updatedAt },
  ];
}

export function TopicFilters({ list }: { list: ReturnType<typeof useListParams> }) {
  const t = useT();
  return (
    <div className="adm-filters">
      <FilterText label={t('list.search')} value={list.filters.q} onApply={(v) => list.setFilter('q', v)} />
      <SubjectFilter value={list.filters.subjectKey} onApply={(v) => list.setFilter('subjectKey', v)} />
      <FilterSelect label={t('fields.status')} value={list.filters.status} options={CONTENT_STATUSES.map((s) => ({ value: s, label: t(`enum.${s}`) }))} onApply={(v) => list.setFilter('status', v)} />
    </div>
  );
}

export function TopicsList() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(['q', 'subjectKey', 'status']);
  const canCreate = useCanCall('adminTopicCreate');
  const canSubmit = useCanCall('adminTopicSubmit');
  const columns = useMemo(() => topicColumns(t, lang), [t, lang]);
  const bulk: BulkAction<AdminTopic>[] = canSubmit
    ? [{ id: 'submit', label: t('workflow.submit'), run: async (rows) => { for (const r of rows.filter((x) => x.status === 'draft')) await api.call('adminTopicSubmit', { params: { id: r.id }, body: {} }).catch(() => undefined); } }]
    : [];
  return (
    <section>
      <PageHeader title={t('nav.topics')} icon={navIcon('topics')} description={t('pages.topics')}>
        {canCreate && (
          <Link className="adm-btn adm-btn--primary" to={to('topics/new')}>
            <Icon id="plus" size={18} />
            {t('common.create')}
          </Link>
        )}
      </PageHeader>
      <TopicFilters list={list} />
      <ListView endpoint="adminTopicList" list={list} columns={columns} rowKey={(r: AdminTopic) => r.id} bulkActions={bulk} onRowClick={(r: AdminTopic) => nav(to(`topics/${r.id}`))} />
    </section>
  );
}

export function TopicCreate() {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const [value, setValue] = useState({ key: '', unitKey: '' });
  const issues = useValidation(AdminTopicCreateSchema, value);
  const create = useApiMutation('adminTopicCreate', ['adminTopicList']);
  const suggest = useSuggestions(['units']);
  return (
    <section>
      <PageHeader title={`${t('nav.topics')} · ${t('common.new')}`} />
      <SchemaForm schema={AdminTopicCreateSchema} value={value} onChange={setValue} suggest={suggest} />
      <ErrorBox error={create.error} />
      <button type="button" className="adm-btn adm-btn--primary" disabled={issues.length > 0 || create.isPending} onClick={() => create.mutate({ body: value }, { onSuccess: (r) => nav(to(`topics/${r.id}`), { replace: true }) })}>
        {t('common.create')}
      </button>
    </section>
  );
}
