/**
 * Role routing after the staff sign-in (v0.8.0): a teacher who signs in at
 * /admin gets a friendly «Это вход для сотрудников» screen with the way to
 * the teacher sign-in; staff land on the first section their permissions
 * open (SuperAdmin and content managers: the dashboard).
 */
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { canCallWith, useCanCall } from '../api/hooks';
import { api, useSession } from '../api/session';
import { AuthCorner } from '../auth/Login';
import { useAdminLang, useT } from '../i18n';
import { Icon } from '../lib/icons';
import { Dashboard } from '../modules/Dashboard';
import { useAdminPath } from '../shell/base';
import { Brand, NAV } from '../shell/Layout';
import { btn } from './ui';

export function TeacherAtAdmin() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const nav = useNavigate();
  const me = useSession((s) => s.me);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    await api.call('logout', { body: {} }).catch(() => undefined);
    useSession.getState().signOut();
  };
  const go = async () => {
    setBusy(true);
    await signOut();
    nav(`/${lang}/login`);
  };
  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-16">
      <AuthCorner />
      <main className="grid w-full max-w-120 justify-items-start gap-5 rounded-xl border border-edge bg-panel p-6 shadow-panel md:p-8" aria-labelledby="staff-only-title">
        <Brand />
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
          <Icon id="school" size={28} />
        </span>
        <h1 id="staff-only-title" className="text-ink">
          {t('gate.teacherTitle')}
        </h1>
        <p className="text-base text-ink">{t('gate.teacherText', { name: me?.displayName ?? '' })}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btn('primary')} disabled={busy} onClick={go}>
            <Icon id="user" size={18} />
            {t('gate.teacherLogin')}
          </button>
          <button type="button" className={btn('ghost')} onClick={signOut}>
            {t('gate.otherAccount')}
          </button>
        </div>
      </main>
    </div>
  );
}

/** `/admin` index: the dashboard when content is open to you, else your first section. */
export function AdminHome() {
  const perms = useSession((s) => s.me?.permissions);
  const to = useAdminPath();
  const dashboard = useCanCall('adminTopicList');
  if (dashboard) return <Dashboard />;
  const first = NAV.find((n) => n.path && canCallWith(perms, n.endpoint));
  return first ? <Navigate to={to(first.path)} replace /> : null;
}
