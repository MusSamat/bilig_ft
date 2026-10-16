/**
 * Admin sign-in (TZ §6): e-mail + password, then a TOTP code when the server
 * answers 401 `totp_required`. Roles without an enrolled authenticator get a
 * 403 `totp_enrollment_required`; the enrolment step signs in once with the
 * client audience (which does not need TOTP), sets up the authenticator via
 * POST /me/2fa, closes that client session and returns to the code step.
 */
import { useState, type FormEvent } from 'react';
import { LoginRequestSchema, TotpSchema } from '@bilig/content-model/api';
import { ApiError, validationError } from '../api/client';
import { api, useSession } from '../api/session';
import { useT } from '../i18n';
import { Icon } from '../lib/icons';
import { Brand, LangSeg, ThemeButton } from '../shell/Layout';
import { ErrorBox } from '../shell/ui';

type Step = 'password' | 'totp' | 'enroll';

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
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<{ token: string; otpauthUrl?: string } | null>(null);

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
    useSession.getState().setToken(res.accessToken);
    await loadMe();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (step === 'password') await login();
      else if (step === 'totp') {
        if (!TotpSchema.safeParse(code).success) {
          setError(validationError('login', [{ path: ['totp'], message: t('login.totpFormat') }]));
          return;
        }
        await login(code);
      } else if (step === 'enroll' && enroll) {
        await api.call('me2fa', { body: { action: 'verify', code }, token: enroll.token, audience: 'client' });
        await api.call('logout', { body: {}, token: enroll.token, audience: 'client' }).catch(() => undefined);
        setEnroll(null);
        setCode('');
        setInfo(t('login.enrolled'));
        setStep('totp');
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') {
        setStep('totp');
        setCode('');
      } else if (err instanceof ApiError && err.code === 'forbidden' && err.detail === 'totp_enrollment_required') {
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
      const tok = await api.call('login', { body: { email, password }, audience: 'client' });
      const r = await api.call('me2fa', { body: { action: 'setup' }, token: tok.accessToken, audience: 'client' });
      setEnroll({ token: tok.accessToken, otpauthUrl: r.otpauthUrl });
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
            {!enroll ? (
              <button type="button" className="adm-btn" disabled={busy} onClick={startEnroll}>
                <Icon id="key" size={18} />
                {t('login.enrollStart')}
              </button>
            ) : (
              <>
                <p>{t('login.enrollScan')}</p>
                {enroll.otpauthUrl && (
                  <code className="adm-otpauth" data-testid="otpauth">
                    {enroll.otpauthUrl}
                  </code>
                )}
                <label className="adm-field">
                  <span>{t('login.totp')}</span>
                  <input className="adm-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </label>
              </>
            )}
          </>
        )}
        {info && <p className="adm-alert adm-alert--info">{info}</p>}
        <ErrorBox error={error} />
        <div className="adm-login__actions">
          {step !== 'password' && (
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => { setStep('password'); setCode(''); setError(null); }}>
              <Icon id="prev" size={18} />
              {t('common.back')}
            </button>
          )}
          {(step !== 'enroll' || enroll) && (
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
