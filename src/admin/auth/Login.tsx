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
    <div className="adm-login__corner absolute top-4 right-4 flex gap-2">
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
  const field = 'block w-full min-h-12 rounded-md border border-line bg-chip px-4 text-md text-ink transition-colors hover:border-accent';
  const otp = `${field} max-w-60 font-mono text-xl tracking-[0.4em]`;
  const label = 'grid gap-1.5 text-sm font-semibold text-ink';
  const button = 'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-pill border px-6 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-16">
      <AuthCorner />
      <form className="grid w-full max-w-110 gap-5 rounded-xl border border-edge bg-panel p-6 shadow-panel md:p-8" onSubmit={submit} noValidate aria-labelledby="adm-login-title">
        <Brand />
        <div className="flex items-start gap-4">
          <span className="inline-flex size-12 flex-none items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
            <Icon id={stepIcon} size={24} />
          </span>
          <div className="grid gap-1">
            <h1 id="adm-login-title" className="text-ink">
              {t('login.title')}
            </h1>
            <p className="text-base text-muted">{step === 'password' ? t('login.subtitle') : step === 'totp' ? t('login.totpPrompt') : t('login.enrollPrompt')}</p>
          </div>
        </div>
        <ol className="m-0 flex list-none items-center gap-2 p-0 text-sm font-semibold" aria-label={t('login.stepsLabel')}>
          <li className={`inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 ${step === 'password' ? 'border-accent text-accent' : 'border-ok text-ok'}`} aria-current={step === 'password' ? 'step' : undefined}>
            {step === 'password' ? '1' : <Icon id="check" size={16} />} {t('login.stepPassword')}
          </li>
          <li aria-hidden="true" className="h-px w-6 bg-line" />
          <li className={`inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 ${step === 'password' ? 'border-line text-muted' : 'border-accent text-accent'}`} aria-current={step !== 'password' ? 'step' : undefined}>
            2 {t('login.stepCode')}
          </li>
        </ol>
        {step === 'password' && (
          <>
            <label className={label}>
              <span>{t('login.email')}</span>
              <input className={field} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className={label}>
              <span>{t('login.password')}</span>
              <input className={field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        )}
        {step === 'totp' && (
          <label className={label}>
            <span>{t('login.totp')}</span>
            <input className={otp} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}
        {step === 'enroll' && (
          <>
            {!otpauthUrl ? (
              <button type="button" className={`${button} border-transparent bg-accent text-on`} disabled={busy} onClick={startEnroll}>
                <Icon id="key" size={18} />
                {t('login.enrollStart')}
              </button>
            ) : (
              <>
                <p className="text-base text-ink">{t('login.enrollScan')}</p>
                <code className="block rounded-md border border-line bg-chip p-3 text-sm break-all text-ink" data-testid="otpauth">
                  {otpauthUrl}
                </code>
                {otpSecret(otpauthUrl) && (
                  <p className="text-sm text-muted">
                    {t('login.enrollSecret')} <code className="font-mono text-ink" data-testid="otp-secret">{otpSecret(otpauthUrl)}</code>
                  </p>
                )}
                <label className={label}>
                  <span>{t('login.totp')}</span>
                  <input className={otp} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </label>
              </>
            )}
          </>
        )}
        <ErrorBox error={error} />
        <div className="flex flex-wrap-reverse items-center justify-between gap-3">
          {step !== 'password' ? (
            <button type="button" className={`${button} border-transparent bg-transparent text-accent hover:bg-soft`} onClick={() => { setStep('password'); setCode(''); setError(null); setEnrollToken(null); setOtpauthUrl(null); }}>
              <Icon id="prev" size={18} />
              {t('common.back')}
            </button>
          ) : (
            <span />
          )}
          {(step !== 'enroll' || otpauthUrl) && (
            <button type="submit" className={`${button} border-transparent bg-accent text-on shadow-panel hover:opacity-90`} disabled={busy}>
              {step === 'password' ? t('login.submit') : t('login.verify')}
              <Icon id="arrow" size={18} />
            </button>
          )}
        </div>
        <p className="border-t border-line pt-4 text-sm text-muted">{t('login.staffOnly')}</p>
      </form>
    </div>
  );
}
