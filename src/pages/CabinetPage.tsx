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
import '../cabinet/cabinet.css';

export default function CabinetPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.me);
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);

  if (status === 'loading') {
    return (
      <div className="page">
        <p className="muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="page narrow stack">
        <h1>{t('cabinet.title')}</h1>
        <p>{t('cabinet.guest')}</p>
        <div>
          <Link className="btn btn--primary" to={`/${lang}/login`}>
            {t('cabinet.signIn')}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <h1>{t('cabinet.title')}</h1>
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
        <dl className="stack">
          <div>
            <dt className="muted small">{t('cabinet.name')}</dt>
            <dd>{me.displayName}</dd>
          </div>
          {me.email && (
            <div>
              <dt className="muted small">{t('cabinet.email')}</dt>
              <dd>{me.email}</dd>
            </div>
          )}
        </dl>
        {canTeach && (
          <div>
            <Link className="btn btn--primary btn--sm" to={`/${lang}/teacher`}>
              <Icon name="users" size={16} />
              {t('cabinet.teacherLink')}
            </Link>
          </div>
        )}
      </section>
      <section className="card stack" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="panel-title">
          <Icon name="keyboard" />
          {t('cabinet.sessions')}
        </h2>
        {sessions.isLoading && <p className="muted">{t('common.loading')}</p>}
        {sessions.isError && <p className="error-text">{t('cabinet.loadError')}</p>}
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
            <Icon name="logout" size={16} />
            {t('cabinet.logoutAll')}
          </button>
        </div>
      </section>
    </div>
  );
}
