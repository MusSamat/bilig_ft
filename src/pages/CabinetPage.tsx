/**
 * Personal cabinet (W-54). Students: assignments with due dates, progress per
 * topic, recently opened topics. Adults: profile, active sessions and «sign out
 * on all devices» (TZ §6). Guests are asked to sign in.
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { logout, usePermission, useSession } from '../api/session';
import { RecentTopics, useRecentTopics } from '../cabinet/RecentTopics';
import { StudentAssignments, useMyAssignments } from '../cabinet/StudentAssignments';
import { TopicProgressList } from '../cabinet/TopicProgressList';
import { formatDate } from '../cabinet/format';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';

export default function CabinetPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.me);
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);

  if (status === 'loading') {
    return (
      <div className="page" aria-busy="true" aria-label={t('common.loading')}>
        <span className="panel glass skel" style={{ height: 100 }} />
        <div className="grid-2">
          <span className="panel glass skel" style={{ height: 260 }} />
          <span className="panel glass skel" style={{ height: 260 }} />
        </div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="page page--narrow">
        <section className="card stack" aria-labelledby="cab-title">
          <h1 id="cab-title" className="page-title">
            {t('cabinet.title')}
          </h1>
          <div className="state">
            <Icon name="lock" />
            <span>{t('cabinet.guest')}</span>
            <Link className="cta" to={`/${lang}/login`}>
              <Icon name="user" className="sm" />
              {t('cabinet.signIn')}
            </Link>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-h panel glass">
        <span className="orb s" aria-hidden="true">
          <Icon name={me.kind === 'student' ? 'grad' : 'user'} />
        </span>
        <div>
          <h1 className="page-title">{t('cabinet.title')}</h1>
          <p>{me.displayName}</p>
        </div>
      </header>
      {me.kind === 'student' ? <StudentCabinet /> : <AdultCabinet />}
    </div>
  );
}

function StudentCabinet(): JSX.Element {
  const { data } = useMyAssignments();
  const recent = useRecentTopics(6);
  const keys = [...(data?.items.map((a) => a.topicKey) ?? []), ...recent.map((r) => r.topicKey)];
  return (
    <div className="grid-2">
      <StudentAssignments />
      <TopicProgressList topicKeys={keys} />
      <RecentTopics />
    </div>
  );
}

function AdultCabinet(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const me = useSession((s) => s.me)!;
  const canTeach = usePermission('class.manage');
  const sessions = useQuery({ queryKey: ['me-sessions'], queryFn: () => api('meSessions'), retry: false });

  return (
    <div className="grid-2">
      <section className="card stack" aria-labelledby="profile-title">
        <h2 id="profile-title" className="panel-title">
          <Icon name="user" />
          {t('cabinet.profile')}
        </h2>
        <dl className="kv">
          <div>
            <dt>{t('cabinet.name')}</dt>
            <dd>{me.displayName}</dd>
          </div>
          {me.email && (
            <div>
              <dt>{t('cabinet.email')}</dt>
              <dd>{me.email}</dd>
            </div>
          )}
        </dl>
        {canTeach && (
          <div>
            <Link className="btn btn--primary btn--sm" to={`/${lang}/teacher`}>
              <Icon name="users" className="sm" />
              {t('cabinet.teacherLink')}
            </Link>
          </div>
        )}
      </section>
      <section className="card stack" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="panel-title">
          <Icon name="key" />
          {t('cabinet.sessions')}
        </h2>
        {sessions.isLoading && <span className="skel" style={{ height: 64, borderRadius: 'var(--r-lg)' }} aria-label={t('common.loading')} />}
        {sessions.isError && (
          <div className="state state--error" role="alert">
            <Icon name="warn" />
            <b>{t('cabinet.loadError')}</b>
            <button type="button" className="btn2" onClick={() => sessions.refetch()}>
              <Icon name="reset" className="sm" />
              {t('common.retry')}
            </button>
          </div>
        )}
        <ul className="assignment-list">
          {sessions.data?.items.map((s) => (
            <li key={s.id} className="assignment">
              <div className="assignment__head">
                <b>{s.device}</b>
                {s.current && <span className="badge badge--accent">{t('cabinet.sessionCurrent')}</span>}
              </div>
              <span className="muted small">
                {t('cabinet.sessionCreated', { date: formatDate(lang, s.createdAt, true) })}
                {' · '}
                {t('cabinet.sessionExpires', { date: formatDate(lang, s.expiresAt, true) })}
              </span>
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              await logout(true);
              navigate(`/${lang}`);
            }}
          >
            <Icon name="logout" className="sm" />
            {t('cabinet.logoutAll')}
          </button>
        </div>
      </section>
    </div>
  );
}
