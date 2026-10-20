/**
 * The persistent banner on every client page while a staff member works in a
 * teacher's cabinet (v0.8.0): who, the mode (view / edit), the time left and
 * «Выйти в админку». At zero (or when the server drops the session) it exits
 * by itself and goes back to the admin with a message there.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { exitSupport, useSupport, type SupportExit } from './store';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function SupportBanner(): JSX.Element | null {
  const { t } = useTranslation();
  const nav = useNavigate();
  const active = useSupport((s) => s.active);
  const lost = useSupport((s) => s.lost);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (!active) return;
    leaving.current = false;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [active]);

  const leave = async (why: SupportExit) => {
    if (leaving.current) return;
    leaving.current = true;
    setBusy(true);
    const to = await exitSupport(why);
    setBusy(false);
    if (to) nav(to);
  };

  const left = active ? active.expiresAt - now : 0;
  useEffect(() => {
    if (active && (left <= 0 || lost)) void leave(lost ? 'revoked' : 'expired');
  }, [active, left <= 0, lost]);

  if (!active) return null;
  const edit = active.session.mode === 'edit';
  return (
    <div
      role="region"
      aria-label={t('support.region')}
      data-testid="support-banner"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-ink px-4 py-2 text-sm text-g3 md:px-6 md:text-base"
    >
      <Icon name={edit ? 'pencil' : 'eye'} className="sm" />
      <p className="m-0 min-w-0 flex-[1_1_16rem]">
        <span>{t('support.inCabinet', { teacher: active.session.teacher.displayName })}</span>{' '}
        <b className="font-bold">{t('support.mode', { mode: t(edit ? 'support.modeEdit' : 'support.modeView') })}</b>
        <span aria-hidden="true"> · </span>
        <span>
          {t('support.left')} <time className="font-mono font-semibold tabular-nums" aria-live="off">{mmss(left)}</time>
        </span>
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void leave('user')}
        className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-pill border border-g3 bg-transparent px-4 text-base font-semibold text-g3 transition-colors hover:bg-g3 hover:text-ink disabled:opacity-50"
      >
        <Icon name="logout" className="sm" />
        {t('support.exit')}
      </button>
    </div>
  );
}
