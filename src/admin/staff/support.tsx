/**
 * Opening a teacher's cabinet from the admin (v0.8.0 support sessions):
 * view needs teacher.view; edit needs teacher.edit, a reason (≥ 10) and the
 * staff member's 2FA code again. The answer's client token goes to the
 * support store (memory only) and the SAME tab switches to /:lang/teacher;
 * the admin session stays as it is and resumes on «Выйти в админку».
 */
import { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import { SupportStartRequestSchema, TotpSchema, type SupportMode } from '@bilig/content-model/api';
import { enterSupport } from '../../support/store';
import { api } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { Icon } from '../lib/icons';
import { useAdminPath } from '../shell/base';
import { ErrorLine, Notice, ReasonField, Sheet, TotpField, btn } from './ui';

/** The host app's query cache (cleared on enter / exit so teacher data never outlives the session). */
export const HostCacheContext = createContext<QueryClient | undefined>(undefined);

export function useStartSupport(teacherId: string) {
  const nav = useNavigate();
  const to = useAdminPath();
  const lang = useAdminLang((s) => s.lang);
  const cache = useContext(HostCacheContext);
  const { i18n: host } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const start = async (mode: SupportMode, extra: { reason?: string; totp?: string } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.call('supportStart', { params: { id: teacherId }, body: { mode, ...extra } });
      await enterSupport({
        session: res.session,
        accessToken: res.accessToken,
        expiresIn: res.expiresIn,
        returnTo: to(`teachers/${teacherId}`),
        end: () => api.call('supportEnd', { params: { sessionId: res.session.id }, body: {} }),
        cache,
      });
      // the cabinet opens in the admin's language (no flash of the browser's language)
      if (host.language !== lang) await host.changeLanguage(lang).catch(() => undefined);
      nav(`/${lang}/teacher`);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { start, busy, error };
}

/** «Режим правки»: reason ≥ 10 characters + the 2FA code, then the session starts. */
export function EditModeDialog({ teacherId, teacherName, onClose }: { teacherId: string; teacherName: string; onClose(): void }) {
  const t = useT();
  const { start, busy, error } = useStartSupport(teacherId);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const errs = {
    reason: reason.trim().length < 10 ? t('staffui.reasonShort', { min: 10 }) : null,
    code: !TotpSchema.safeParse(code).success ? t('staffui.totpError') : null,
  };
  const go = async () => {
    setTried(true);
    if (errs.reason || errs.code) return;
    const body = { mode: 'edit' as const, reason: reason.trim(), totp: code };
    if (!SupportStartRequestSchema.safeParse(body).success) return;
    await start('edit', { reason: body.reason, totp: code });
  };
  return (
    <Sheet
      title={t('teachers.edit.title', { name: teacherName })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn('ghost')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={btn('primary')} disabled={busy} onClick={go}>
            <Icon id="pencil" size={18} />
            {t('teachers.edit.submit')}
          </button>
        </>
      }
    >
      <Notice>{t('teachers.edit.warning')}</Notice>
      <ReasonField value={reason} onChange={setReason} min={10} error={tried ? errs.reason : null} label={t('teachers.edit.reason')} />
      <TotpField value={code} onChange={setCode} error={tried ? errs.code : null} />
      <ErrorLine error={error} />
    </Sheet>
  );
}
