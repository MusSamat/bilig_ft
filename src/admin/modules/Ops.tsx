/**
 * A-18 tutor settings (PUT with If-Match → conflict dialog) and
 * A-19 audit log (read-only; filters actor / action / target type in the URL).
 */
import { useMemo } from 'react';
import { TutorSettingsSchema, type TutorSettings } from '@bilig/content-model/api';
import type { z } from 'zod';
import { useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../lib/versioned';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { ErrorBox, FilterText, PageHeader, fmtDate } from '../shell/ui';
import type { AuditEntrySchema } from '@bilig/content-model/api';
import { navIcon } from '../shell/Layout';

type Settings = Omit<TutorSettings, 'version'>;

export function TutorSettingsPage() {
  const t = useT();
  const q = useApiQuery('adminTutorSettingsGet');
  const canPut = useCanCall('adminTutorSettingsPut');
  const server = useMemo<Versioned<Settings> | undefined>(() => {
    if (!q.data) return undefined;
    const { version, ...value } = q.data;
    return { value, version };
  }, [q.data]);
  const editor = useVersionedEditor<Settings>({
    draftKey: 'tutor-settings',
    server,
    save: async (value, version) => {
      const { version: v, ...rest } = await api.call('adminTutorSettingsPut', { body: { ...value, version }, ifMatch: version });
      return { value: rest, version: v };
    },
    reload: async () => {
      const { version, ...value } = await api.call('adminTutorSettingsGet');
      return { value, version };
    },
  });
  const schema = useMemo(() => TutorSettingsSchema.omit({ version: true }), []);
  const issues = useValidation(schema, editor.value);
  return (
    <section>
      <PageHeader title={t('nav.tutor')} icon={navIcon('tutor')} description={t('pages.tutor')}>{editor.version !== undefined && <span className="adm-muted">{t('common.version', { v: editor.version })}</span>}</PageHeader>
      <ErrorBox error={q.error} />
      <DraftBanner editor={editor} />
      {editor.value && <SchemaForm schema={schema} value={editor.value} onChange={editor.setValue} readOnly={!canPut} />}
      <p className="adm-hint">{t('tutor.note')}</p>
      <SaveBar editor={editor} disabled={issues.length > 0} canSave={canPut} />
    </section>
  );
}

type Audit = z.infer<typeof AuditEntrySchema>;

export function AuditLog() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const list = useListParams(['actorId', 'action', 'targetType']);
  const columns = useMemo<Column<Audit>[]>(
    () => [
      { key: 'ts', header: t('audit.ts'), render: (a) => fmtDate(a.ts, lang), sortValue: (a) => a.ts },
      { key: 'actorId', header: t('audit.actor'), render: (a) => (a.actorId ? <button type="button" className="adm-link" onClick={(e) => { e.stopPropagation(); list.setFilter('actorId', a.actorId!); }}>{a.actorId.slice(0, 8)}</button> : <span className="adm-muted">{t('audit.anonymous')}</span>) },
      { key: 'action', header: t('audit.action'), render: (a) => <code>{a.action}</code>, sortValue: (a) => a.action },
      { key: 'target', header: t('audit.target'), render: (a) => `${a.targetType}:${a.targetId.slice(0, 12)}`, sortValue: (a) => a.targetType },
      { key: 'ip', header: 'IP', render: (a) => a.ip ?? '—' },
      { key: 'diff', header: t('audit.diff'), render: (a) => (a.diff === undefined ? '—' : <details><summary>{t('audit.show')}</summary><pre className="adm-mono">{JSON.stringify(a.diff, null, 2)}</pre></details>) },
    ],
    [t, lang, list],
  );
  return (
    <section>
      <PageHeader title={t('nav.audit')} icon={navIcon('audit')} description={t('pages.audit')} />
      <div className="adm-filters">
        <FilterText label={t('audit.actor')} value={list.filters.actorId} onApply={(v) => list.setFilter('actorId', v)} />
        <FilterText label={t('audit.action')} value={list.filters.action} onApply={(v) => list.setFilter('action', v)} />
        <FilterText label={t('audit.targetType')} value={list.filters.targetType} onApply={(v) => list.setFilter('targetType', v)} />
      </div>
      <ListView endpoint="adminAudit" list={list} columns={columns} rowKey={(a: Audit) => a.id} />
      <p className="adm-hint">{t('audit.readOnly')}</p>
    </section>
  );
}
