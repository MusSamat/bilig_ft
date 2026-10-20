/**
 * «Учителя» (v0.8.0, teacher.view): search by name / phone / e-mail / school,
 * filters (account status, profile complete), a table → the teacher's page
 * with the profile summary, classes and subjects, «Открыть кабинет» (view),
 * «Режим правки» (teacher.edit: reason + 2FA) and «Запросить удаление».
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { TeacherSummary } from '@bilig/content-model/api';
import { useSupport } from '../../support/store';
import { useApiQuery, useCanCall, usePermissions } from '../api/hooks';
import { useAdminLang, useT } from '../i18n';
import { Icon } from '../lib/icons';
import { useAdminPath } from '../shell/base';
import { toast } from '../shell/toast';
import { RequestDeletionButton } from './deletion';
import { EditModeDialog, useStartSupport } from './support';
import {
  Card,
  Chip,
  Empty,
  ErrorLine,
  Loading,
  Notice,
  PageTitle,
  Pager,
  Td,
  btn,
  fmtDateTime,
  inputCls,
  tableCls,
  tbodyCls,
  thCls,
  theadCls,
  trCls,
} from './ui';

const STATUS_TONE = { active: 'ok', blocked: 'bad', deleted: 'neutral' } as const;

function ProfileChip({ status }: { status: TeacherSummary['profileStatus'] }) {
  const t = useT();
  return (
    <Chip tone={status === 'complete' ? 'ok' : 'warn'}>
      <Icon id={status === 'complete' ? 'check' : 'warn'} size={16} />
      {t(`teachers.profile.${status}`)}
    </Chip>
  );
}

export function TeachersPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const searchId = useId();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';
  const profile = sp.get('profile') ?? '';
  const [text, setText] = useState(q);
  const [trail, setTrail] = useState<string[]>([]);
  useEffect(() => setText(q), [q]);
  useEffect(() => setTrail([]), [q, status, profile]);
  const query = {
    ...(q ? { q } : {}),
    ...(status ? { status: status as TeacherSummary['status'] } : {}),
    ...(profile ? { profileStatus: profile as TeacherSummary['profileStatus'] } : {}),
    ...(trail.length ? { cursor: trail[trail.length - 1] } : {}),
    limit: 25,
  };
  const list = useApiQuery('teacherList', { query });
  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    set('q', text.trim());
  };
  const items = list.data?.items ?? [];
  const filtered = !!(q || status || profile);

  return (
    <div className="grid gap-5">
      <PageTitle title={t('teachers.title')} description={t('teachers.lead')} icon="school" />
      <form role="search" onSubmit={submit} className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="grid gap-1.5">
          <label htmlFor={searchId} className="text-sm font-semibold text-ink">
            {t('teachers.search')}
          </label>
          <div className="flex gap-2">
            <input id={searchId} type="search" className={inputCls} placeholder={t('teachers.searchHint')} value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className={btn('primary', 'px-4')} aria-label={t('teachers.searchGo')}>
              <Icon id="search" size={18} />
              <span className="max-md:sr-only">{t('teachers.searchGo')}</span>
            </button>
          </div>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          {t('teachers.filter.status')}
          <select className={inputCls} value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">{t('teachers.filter.any')}</option>
            {(['active', 'blocked', 'deleted'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`teachers.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          {t('teachers.filter.profile')}
          <select className={inputCls} value={profile} onChange={(e) => set('profile', e.target.value)}>
            <option value="">{t('teachers.filter.any')}</option>
            <option value="complete">{t('teachers.profile.complete')}</option>
            <option value="incomplete">{t('teachers.profile.incomplete')}</option>
          </select>
        </label>
      </form>

      {list.isLoading ? (
        <Loading rows={5} />
      ) : list.error ? (
        <ErrorLine error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Empty
          icon="search"
          title={filtered ? t('teachers.emptyFiltered') : t('teachers.empty')}
          text={filtered ? t('teachers.emptyFilteredHint') : undefined}
          action={
            filtered ? (
              <button type="button" className={btn('secondary')} onClick={() => setSp(new URLSearchParams(), { replace: true })}>
                {t('teachers.clear')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <table className={tableCls}>
          <caption className="sr-only">{t('teachers.title')}</caption>
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>{t('teachers.col.name')}</th>
              <th className={thCls}>{t('teachers.col.school')}</th>
              <th className={thCls}>{t('teachers.col.classes')}</th>
              <th className={thCls}>{t('teachers.col.profile')}</th>
              <th className={thCls}>{t('teachers.col.status')}</th>
              <th className={thCls}>{t('teachers.col.active')}</th>
            </tr>
          </thead>
          <tbody className={tbodyCls}>
            {items.map((x) => (
              <tr key={x.id} className={trCls}>
                <Td label={t('teachers.col.name')}>
                  <span className="grid min-w-0">
                    <Link className="inline-flex min-h-11 items-center font-semibold text-accent" to={to(`teachers/${x.id}`)}>
                      {x.displayName}
                    </Link>
                    <span className="break-words text-sm text-muted">{[x.phone, x.email].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                </Td>
                <Td label={t('teachers.col.school')}>
                  <span className="grid">
                    <span>{x.schoolName || '—'}</span>
                    <span className="text-sm text-muted">{x.region}</span>
                  </span>
                </Td>
                <Td label={t('teachers.col.classes')}>
                  <span className="grid">
                    <span>{t('teachers.classesCount', { count: x.classes })}</span>
                    <span className="text-sm text-muted">{x.subjects.join(', ') || '—'}</span>
                  </span>
                </Td>
                <Td label={t('teachers.col.profile')}>
                  <ProfileChip status={x.profileStatus} />
                </Td>
                <Td label={t('teachers.col.status')}>
                  <Chip tone={STATUS_TONE[x.status]}>{t(`teachers.status.${x.status}`)}</Chip>
                </Td>
                <Td label={t('teachers.col.active')}>{fmtDateTime(x.lastActiveAt, lang)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager trail={trail} next={list.data?.nextCursor} onBack={() => setTrail((c) => c.slice(0, -1))} onNext={(n) => setTrail((c) => [...c, n])} />
    </div>
  );
}

export function TeacherDetail() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const { id = '' } = useParams();
  const can = usePermissions();
  const canJournal = useCanCall('journal');
  const q = useApiQuery('teacherGet', { params: { id } });
  const { start, busy, error } = useStartSupport(id);
  const [editing, setEditing] = useState(false);
  const notice = useSupport((s) => s.notice);
  const clearNotice = useSupport((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    toast(`teachers.support.${notice}`, { tone: notice === 'user' ? 'ok' : 'info' });
  }, [notice]);
  useEffect(() => () => clearNotice(), [clearNotice]);

  if (q.isLoading) return <Loading rows={4} />;
  if (q.error || !q.data) return <ErrorLine error={q.error} onRetry={() => void q.refetch()} />;
  const x = q.data;
  const active = x.status === 'active';
  const rows: [string, string][] = [
    [t('teachers.field.phone'), x.phone ?? '—'],
    [t('teachers.field.email'), x.email ?? '—'],
    [t('teachers.field.school'), x.schoolName || '—'],
    [t('teachers.field.region'), x.region || '—'],
    [t('teachers.field.lang'), x.teachingLang ? t(`teachers.lang.${x.teachingLang}`) : '—'],
    [t('teachers.field.created'), fmtDateTime(x.createdAt, lang)],
    [t('teachers.field.active'), fmtDateTime(x.lastActiveAt, lang)],
  ];
  return (
    <div className="grid gap-5">
      <Link to={to('teachers')} className="inline-flex min-h-11 w-fit items-center gap-2 font-semibold text-accent">
        <Icon id="prev" size={18} />
        {t('teachers.back')}
      </Link>
      <PageTitle
        title={x.displayName}
        description={[x.schoolName, x.region].filter(Boolean).join(' · ')}
        icon="user"
        action={
          <button type="button" className={btn('primary')} disabled={!active || busy} onClick={() => void start('view')}>
            <Icon id="eye" size={18} />
            {t('teachers.open')}
          </button>
        }
      />
      {notice && notice !== 'user' && <Notice tone="info">{t(`teachers.support.${notice}`)}</Notice>}
      {!active && <Notice>{t('teachers.notActive')}</Notice>}
      <ErrorLine error={error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('teachers.profileCard')} titleId="t-profile">
          <div className="mb-4 flex flex-wrap gap-2">
            <ProfileChip status={x.profileStatus} />
            <Chip tone={STATUS_TONE[x.status]}>{t(`teachers.status.${x.status}`)}</Chip>
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="m-0 break-words text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title={t('teachers.classesCard')} titleId="t-classes">
          <p className="mb-3 text-base text-ink">{t('teachers.classesCount', { count: x.classes })}</p>
          {x.subjects.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t('teachers.subjects')}>
              {x.subjects.map((s) => (
                <li key={s}>
                  <Chip tone="accent">{s}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-muted">{t('teachers.noSubjects')}</p>
          )}
          {x.profileStatus === 'incomplete' && <p className="mt-4 text-sm text-muted">{t('teachers.incompleteHint')}</p>}
        </Card>
      </div>
      <Card title={t('teachers.supportCard')} titleId="t-support">
        <p className="mb-4 max-w-[70ch] text-base text-muted">{t('teachers.supportText')}</p>
        <div className="flex flex-wrap gap-3">
          {can('teacher.edit') && (
            <button type="button" className={btn('secondary')} disabled={!active || busy} onClick={() => setEditing(true)}>
              <Icon id="pencil" size={18} />
              {t('teachers.editMode')}
            </button>
          )}
          {canJournal && (
            <Link className={btn('ghost')} to={`${to('journal')}?onBehalfOfId=${encodeURIComponent(x.id)}`}>
              <Icon id="a-audit" size={18} />
              {t('teachers.journal')}
            </Link>
          )}
          <RequestDeletionButton kind="teacher" targetId={x.id} label={x.displayName} />
        </div>
      </Card>
      {editing && <EditModeDialog teacherId={x.id} teacherName={x.displayName} onClose={() => setEditing(false)} />}
    </div>
  );
}
