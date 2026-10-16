/**
 * A-15 schools & licences: school (name, region, state/private, language of
 * instruction, status), licences (subjects, grades, seats, period), invite a
 * school admin. Schools and licences carry a version since contract 0.3.0:
 * edits and licence deletes send it as If-Match, and a 409 opens the conflict
 * dialog (the server keeps last-write-wins only for callers without a version).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LicenseSchema, SchoolCreateSchema, problem, type License, type School } from '@bilig/content-model/api';
import { ApiError, isConflict } from '../api/client';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { useSuggestions } from '../lib/suggest';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { ConflictDialog, DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../lib/versioned';
import { useAdminPath } from '../shell/base';
import { Dialog, ErrorBox, FilterSelect, FilterText, PageHeader, StatusBadge, fmtDate } from '../shell/ui';
import { Icon } from '../lib/icons';
import { navIcon } from '../shell/Layout';

type SchoolValue = Omit<School, 'id' | 'version'>;
type LicenseValue = Omit<License, 'version'>;

const emptySchool = (): SchoolValue => ({ name: '', region: '', type: 'state', language: 'ky', status: 'active' });
const schoolVersioned = ({ id: _i, version, ...value }: School): Versioned<SchoolValue> => ({ value, version: version ?? 0 });
const licenseVersioned = ({ version, ...value }: License): Versioned<LicenseValue> => ({ value, version: version ?? 0 });
/** 0 = the server sent no version (pre-0.3.0): save without a precondition. */
const ifMatch = (version: number) => (version > 0 ? version : undefined);

export function SchoolsList() {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(['q', 'region', 'status']);
  const canCreate = useCanCall('adminSchoolCreate');
  const [creating, setCreating] = useState(false);
  const columns = useMemo<Column<School>[]>(
    () => [
      { key: 'name', header: t('fields.name'), render: (s) => s.name, sortValue: (s) => s.name },
      { key: 'region', header: t('fields.region'), render: (s) => s.region, sortValue: (s) => s.region },
      { key: 'type', header: t('fields.type'), render: (s) => t(`enum.${s.type}`), sortValue: (s) => s.type },
      { key: 'language', header: t('fields.language'), render: (s) => s.language, sortValue: (s) => s.language },
      { key: 'status', header: t('fields.status'), render: (s) => <StatusBadge status={s.status} />, sortValue: (s) => s.status },
    ],
    [t],
  );
  return (
    <section>
      <PageHeader title={t('nav.schools')} icon={navIcon('schools')} description={t('pages.schools')}>
        {canCreate && (
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>
            <Icon id="plus" size={18} />
            {t('common.create')}
          </button>
        )}
      </PageHeader>
      <div className="adm-filters">
        <FilterText label={t('list.search')} value={list.filters.q} onApply={(v) => list.setFilter('q', v)} />
        <FilterText label={t('fields.region')} value={list.filters.region} onApply={(v) => list.setFilter('region', v)} />
        <FilterSelect label={t('fields.status')} value={list.filters.status} options={['active', 'suspended'].map((s) => ({ value: s, label: t(`enum.${s}`) }))} onApply={(v) => list.setFilter('status', v)} />
      </div>
      <ListView endpoint="adminSchoolList" list={list} columns={columns} rowKey={(s: School) => s.id} onRowClick={(s: School) => nav(to(`schools/${s.id}`))} />
      {creating && <SchoolCreate onClose={() => setCreating(false)} onCreated={(s) => nav(to(`schools/${s.id}`))} />}
    </section>
  );
}

function SchoolCreate({ onClose, onCreated }: { onClose(): void; onCreated(s: School): void }) {
  const t = useT();
  const [v, setV] = useState(emptySchool());
  const issues = useValidation(SchoolCreateSchema, v);
  const create = useApiMutation('adminSchoolCreate', ['adminSchoolList']);
  return (
    <Dialog
      title={t('schools.new')}
      onClose={onClose}
      actions={
        <button type="button" className="adm-btn adm-btn--primary" disabled={issues.length > 0 || create.isPending} onClick={() => create.mutate({ body: v }, { onSuccess: onCreated })}>
          {t('common.create')}
        </button>
      }
    >
      <SchemaForm schema={SchoolCreateSchema} value={v} onChange={setV} />
      <ErrorBox error={create.error} />
    </Dialog>
  );
}

function LicenseEditor({ schoolId, license, onDone }: { schoolId: string; license?: License; onDone(): void }) {
  const t = useT();
  const qc = useQueryClient();
  const suggest = useSuggestions(['subjects']);
  const server = useMemo<Versioned<LicenseValue>>(() => {
    if (license) return licenseVersioned(license);
    const now = new Date();
    return { value: { id: crypto.randomUUID(), schoolId, subjects: [], grades: [], seats: 30, startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 365 * 86400_000).toISOString() }, version: 0 };
  }, [license, schoolId]);
  const editor = useVersionedEditor<LicenseValue>({
    draftKey: null,
    server,
    save: async (value, version) => {
      if (!license) return licenseVersioned(await api.call('adminLicenseCreate', { body: value }));
      const { id: _i, schoolId: _s, ...patch } = value;
      return licenseVersioned(await api.call('adminLicensePatch', { params: { id: license.id }, body: patch, ifMatch: ifMatch(version) }));
    },
    reload: async () => {
      const r = await api.call('adminLicenseList', { query: { schoolId, limit: 100 } });
      const l = r.items.find((x) => x.id === license?.id);
      if (!l) throw new ApiError(404, problem('not_found'), 'adminLicenseList');
      return licenseVersioned(l);
    },
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: ['adminLicenseList'] });
      onDone();
    },
  });
  const v = editor.value ?? server.value;
  const issues = useValidation(LicenseSchema, v);
  return (
    <Dialog
      title={license ? t('schools.editLicense') : t('schools.newLicense')}
      onClose={onDone}
      actions={
        <button type="button" className="adm-btn adm-btn--primary" disabled={issues.length > 0 || editor.saving} onClick={() => void editor.save()}>
          {t('common.save')}
        </button>
      }
    >
      <SchemaForm schema={LicenseSchema} value={v} onChange={editor.setValue} hidden={['id', 'schoolId', 'version']} suggest={suggest} />
      <ErrorBox error={editor.error} />
      <ConflictDialog editor={editor} />
    </Dialog>
  );
}

function InviteAdmin({ schoolId }: { schoolId: string }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const invite = useApiMutation('adminInviteCreate', ['adminInviteList']);
  return (
    <div className="adm-card">
      <h2>{t('schools.inviteAdmin')}</h2>
      <div className="adm-inline">
        <input type="email" aria-label={t('fields.email')} placeholder="name@school.kg" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className="adm-btn" disabled={!email || invite.isPending} onClick={() => invite.mutate({ body: { email, role: 'school_admin', scope: 'school', scopeId: schoolId } }, { onSuccess: () => setEmail('') })}>
          {t('users.invite')}
        </button>
      </div>
      {invite.isSuccess && <p className="adm-alert adm-alert--info">{t('users.invited')}</p>}
      <ErrorBox error={invite.error} />
    </div>
  );
}

export function SchoolDetail() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const q = useApiQuery('adminSchoolGet', { params: { id } });
  const licenses = useApiQuery('adminLicenseList', { query: { schoolId: id, limit: 100 } });
  const canPatch = useCanCall('adminSchoolPatch');
  const canLicense = useCanCall('adminLicenseCreate');
  const canInvite = useCanCall('adminInviteCreate');
  const del = useApiMutation('adminLicenseDelete', ['adminLicenseList']);
  const [lic, setLic] = useState<License | 'new' | null>(null);
  const s = q.data;
  const server = useMemo(() => (s ? schoolVersioned(s) : undefined), [s]);
  const editor = useVersionedEditor<SchoolValue>({
    draftKey: `school:${id}`,
    server,
    save: async (value, version) => schoolVersioned(await api.call('adminSchoolPatch', { params: { id }, body: value, ifMatch: ifMatch(version) })),
    reload: async () => schoolVersioned(await api.call('adminSchoolGet', { params: { id } })),
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: ['adminSchoolList'] });
      void qc.invalidateQueries({ queryKey: ['adminSchoolGet'] });
    },
  });
  const issues = useValidation(SchoolCreateSchema, editor.value);
  const removeLicense = (l: License) =>
    window.confirm(t('common.confirmDelete', { count: 1 })) &&
    del.mutate(
      { params: { id: l.id }, ifMatch: ifMatch(l.version ?? 0) },
      // Stale version: someone changed or removed it meanwhile — show the fresh list with the error.
      { onError: (e) => isConflict(e) && void qc.invalidateQueries({ queryKey: ['adminLicenseList'] }) },
    );
  return (
    <section>
      <PageHeader title={`${t('nav.schools')} · ${s?.name ?? ''}`}>
        <Link className="adm-btn adm-btn--ghost" to={to('schools')}>
          {t('common.back')}
        </Link>
      </PageHeader>
      <ErrorBox error={q.error ?? del.error} />
      {editor.value && (
        <div className="adm-card">
          <DraftBanner editor={editor} />
          <SchemaForm schema={SchoolCreateSchema} value={editor.value} onChange={editor.setValue} readOnly={!canPatch} />
          <SaveBar editor={editor} disabled={issues.length > 0} canSave={canPatch} />
        </div>
      )}
      <div className="adm-card">
        <h2>{t('schools.licenses')}</h2>
        <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>{t('fields.subjects')}</th>
              <th>{t('fields.grades')}</th>
              <th>{t('fields.seats')}</th>
              <th>{t('fields.startsAt')}</th>
              <th>{t('fields.endsAt')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(licenses.data?.items ?? []).map((l) => (
              <tr key={l.id}>
                <td>{l.subjects.join(', ')}</td>
                <td>{l.grades.join(', ')}</td>
                <td>{l.seats}</td>
                <td>{fmtDate(l.startsAt, lang)}</td>
                <td>{fmtDate(l.endsAt, lang)}</td>
                <td>
                  {canLicense && (
                    <>
                      <button type="button" className="adm-btn adm-btn--small" onClick={() => setLic(l)}>
                        {t('common.edit')}
                      </button>
                      <button type="button" className="adm-btn adm-btn--small adm-btn--danger" onClick={() => removeLicense(l)}>
                        {t('common.delete')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {canLicense && (
          <button type="button" className="adm-btn" onClick={() => setLic('new')}>
            <Icon id="plus" size={18} />
            {t('schools.newLicense')}
          </button>
        )}
      </div>
      {canInvite && <InviteAdmin schoolId={id} />}
      {lic && <LicenseEditor schoolId={id} license={lic === 'new' ? undefined : lic} onDone={() => setLic(null)} />}
    </section>
  );
}
