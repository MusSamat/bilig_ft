/**
 * Admin sign-in (TZ §6): e-mail + password, then a TOTP code when the server
 * answers 401 `totp_required`. Roles without an enrolled authenticator get a
 * 403 `totp_enrollment_required` carrying a short-lived `enrollmentToken`
 * (contract 0.3.0): POST /auth/2fa/setup returns the otpauth URL, and
 * POST /auth/2fa/verify with the first code signs straight in to the admin.
 */
import { useState, type FormEvent } from 'react';
import { LoginRequestSchema, TotpSchema, type TokenResponse } from '@bilig/content-model/api';
import { ApiError, validationError } from '../api/client';
import { api, useSession } from '../api/session';
import { useT } from '../i18n';
import { Icon } from '../lib/icons';
import { Brand, LangSeg, ThemeButton } from '../shell/Layout';
import { ErrorBox } from '../shell/ui';

type Step = 'password' | 'totp' | 'enroll';

/** The base32 secret from an otpauth URL, for typing it in by hand. */
export const otpSecret = (url: string) => {
  try {
    return new URL(url).searchParams.get('secret') ?? undefined;
  } catch {
    return undefined;
  }
};

export async function loadMe() {
  const me = await api.call('me');
  useSession.getState().setMe(me);
  return me;
}

/** Language + theme controls in the corner of the sign-in screens. */
export function AuthCorner() {
  return (
    <div className="adm-login__corner">
      <LangSeg />
      <ThemeButton />
    </div>
  );
}

export function Login() {
  const t = useT();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [enrollToken, setEnrollToken] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);

  const login = async (totp?: string) => {
    const body = { email, password, ...(totp ? { totp } : {}) };
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      setError(validationError('login', parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))));
      return;
    }
    const res = await api.call('login', { body: parsed.data });
    if (res.totpRequired && !totp) {
      setStep('totp');
      return;
    }
    await signedIn(res);
  };

  const signedIn = async (res: TokenResponse) => {
    useSession.getState().setToken(res.accessToken);
    await loadMe();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'password') await login();
      else if (step === 'totp') {
        if (!TotpSchema.safeParse(code).success) {
          setError(validationError('login', [{ path: ['totp'], message: t('login.totpFormat') }]));
          return;
        }
        await login(code);
      } else if (step === 'enroll' && enrollToken && otpauthUrl) {
        if (!TotpSchema.safeParse(code).success) {
          setError(validationError('authTotpEnrollVerify', [{ path: ['code'], message: t('login.totpFormat') }]));
          return;
        }
        const res = await api.call('authTotpEnrollVerify', { body: { enrollmentToken: enrollToken, code } });
        setEnrollToken(null);
        setOtpauthUrl(null);
        await signedIn(res);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') {
        setStep('totp');
        setCode('');
      } else if (err instanceof ApiError && err.code === 'forbidden' && err.detail === 'totp_enrollment_required' && err.problem?.enrollmentToken) {
        setEnrollToken(err.problem.enrollmentToken);
        setOtpauthUrl(null);
        setCode('');
        setStep('enroll');
      } else setError(err);
    } finally {
      setBusy(false);
    }
  };

  const startEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.call('authTotpEnrollSetup', { body: { enrollmentToken: enrollToken! } });
      setOtpauthUrl(r.otpauthUrl ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const stepIcon = step === 'password' ? 'lock' : step === 'totp' ? 'shield' : 'key';
  return (
    <div className="adm-login">
      <AuthCorner />
      <form className="adm-login__card" onSubmit={submit} noValidate>
        <Brand />
        <div className="adm-login__head">
          <span className="adm-login__icon">
            <Icon id={stepIcon} size={24} />
          </span>
          <div>
            <h1>{t('login.title')}</h1>
            <p className="adm-muted">{step === 'password' ? t('login.subtitle') : step === 'totp' ? t('login.totpPrompt') : t('login.enrollPrompt')}</p>
          </div>
        </div>
        {step !== 'password' && (
          <ol className="adm-login__steps" aria-hidden="true">
            <li className="is-done">
              <Icon id="check" size={16} />
            </li>
            <li className="is-on">2</li>
          </ol>
        )}
        {step === 'password' && (
          <>
            <label className="adm-field">
              <span>{t('login.email')}</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="adm-field">
              <span>{t('login.password')}</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        )}
        {step === 'totp' && (
          <label className="adm-field">
            <span>{t('login.totp')}</span>
            <input className="adm-otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}
        {step === 'enroll' && (
          <>
            {!otpauthUrl ? (
              <button type="button" className="adm-btn" disabled={busy} onClick={startEnroll}>
                <Icon id="key" size={18} />
                {t('login.enrollStart')}
              </button>
            ) : (
              <>
                <p>{t('login.enrollScan')}</p>
                <code className="adm-otpauth" data-testid="otpauth">
                  {otpauthUrl}
                </code>
                {otpSecret(otpauthUrl) && (
                  <p className="adm-hint">
                    {t('login.enrollSecret')} <code data-testid="otp-secret">{otpSecret(otpauthUrl)}</code>
                  </p>
                )}
                <label className="adm-field">
                  <span>{t('login.totp')}</span>
                  <input className="adm-otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </label>
              </>
            )}
          </>
        )}
        <ErrorBox error={error} />
        <div className="adm-login__actions">
          {step !== 'password' && (
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => { setStep('password'); setCode(''); setError(null); setEnrollToken(null); setOtpauthUrl(null); }}>
              <Icon id="prev" size={18} />
              {t('common.back')}
            </button>
          )}
          {(step !== 'enroll' || otpauthUrl) && (
            <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
              {step === 'password' ? t('login.submit') : t('login.verify')}
              <Icon id="arrow" size={18} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
