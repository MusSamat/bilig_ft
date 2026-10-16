/**
 * A-15 schools & licences: school (name, region, state/private, language of
 * instruction, status), licences (subjects, grades, seats, period), invite a
 * school admin. School and licence writes have no version in contract 0.2.1,
 * so they are last-write-wins (see CONTRACT_REQUESTS.md).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LicenseSchema, SchoolCreateSchema, type License, type School } from '@bilig/content-model/api';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { useSuggestions } from '../lib/suggest';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { Dialog, ErrorBox, PageHeader, StatusBadge, fmtDate } from '../shell/ui';
import { Icon } from '../lib/icons';
import { navIcon } from '../shell/Layout';

const emptySchool = (): Omit<School, 'id'> => ({ name: '', region: '', type: 'state', language: 'ky', status: 'active' });

export function SchoolsList() {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams([]);
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
  const now = new Date();
  const [v, setV] = useState<License>(
    license ?? { id: crypto.randomUUID(), schoolId, subjects: [], grades: [], seats: 30, startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 365 * 86400_000).toISOString() },
  );
  const issues = useValidation(LicenseSchema, v);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      title={license ? t('schools.editLicense') : t('schools.newLicense')}
      onClose={onDone}
      actions={
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={issues.length > 0}
          onClick={async () => {
            try {
              if (license) {
                const { id: _i, schoolId: _s, ...patch } = v;
                await api.call('adminLicensePatch', { params: { id: license.id }, body: patch });
              } else await api.call('adminLicenseCreate', { body: v });
              void qc.invalidateQueries({ queryKey: ['adminLicenseList'] });
              onDone();
            } catch (e) {
              setError(e);
            }
          }}
        >
          {t('common.save')}
        </button>
      }
    >
      <SchemaForm schema={LicenseSchema} value={v} onChange={setV} hidden={['id', 'schoolId']} suggest={suggest} />
      <ErrorBox error={error} />
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
  const { id = '' } = useParams();
  const q = useApiQuery('adminSchoolGet', { params: { id } });
  const licenses = useApiQuery('adminLicenseList', { query: { schoolId: id, limit: 100 } });
  const canPatch = useCanCall('adminSchoolPatch');
  const canLicense = useCanCall('adminLicenseCreate');
  const canInvite = useCanCall('adminInviteCreate');
  const patch = useApiMutation('adminSchoolPatch', ['adminSchoolList', 'adminSchoolGet']);
  const del = useApiMutation('adminLicenseDelete', ['adminLicenseList']);
  const [edit, setEdit] = useState<Omit<School, 'id'> | null>(null);
  const [lic, setLic] = useState<License | 'new' | null>(null);
  const s = q.data;
  const value = edit ?? (s ? { name: s.name, region: s.region, type: s.type, language: s.language, status: s.status } : null);
  const issues = useValidation(SchoolCreateSchema, value);
  return (
    <section>
      <PageHeader title={`${t('nav.schools')} · ${s?.name ?? ''}`}>
        <Link className="adm-btn adm-btn--ghost" to={to('schools')}>
          {t('common.back')}
        </Link>
      </PageHeader>
      <ErrorBox error={q.error ?? patch.error ?? del.error} />
      {value && (
        <div className="adm-card">
          <SchemaForm schema={SchoolCreateSchema} value={value} onChange={setEdit} readOnly={!canPatch} />
          {canPatch && (
            <button type="button" className="adm-btn adm-btn--primary" disabled={!edit || issues.length > 0 || patch.isPending} onClick={() => edit && patch.mutate({ params: { id }, body: edit }, { onSuccess: () => setEdit(null) })}>
              {t('common.save')}
            </button>
          )}
          <p className="adm-hint">{t('schools.noLock')}</p>
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
                      <button type="button" className="adm-btn adm-btn--small adm-btn--danger" onClick={() => window.confirm(t('common.confirmDelete', { count: 1 })) && del.mutate({ params: { id: l.id } })}>
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
