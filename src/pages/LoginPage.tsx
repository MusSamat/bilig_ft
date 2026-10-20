/**
 * Sign-in (TZ §6, contract 0.7.0). Teachers: WhatsApp number + password, with
 * «Forgot password?» (→ /reset) and «Sign up» (→ /register). Staff and admins:
 * a quiet «Sign in with e-mail» switch (+ TOTP when required). The student
 * sign-in (class code → name → PIN) stays in the code behind SHOW_STUDENT_LOGIN.
 * The access token stays in memory (session.ts); the refresh token is an HttpOnly cookie.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassCodeResponse } from '@bilig/content-model/api';
import { isApiError } from '../api/client';
import { loginStudent, lookupClassCode, signIn, useSession, type LoginId } from '../api/session';
import { AuthLayout, ErrorSummary } from '../auth/AuthLayout';
import { classify, problemText, type AuthProblem } from '../auth/errors';
import { PasswordField } from '../auth/PasswordField';
import { PhoneField } from '../auth/PhoneField';
import { digitsOfE164, toE164 } from '../auth/phone';
import { RetryLine } from '../auth/RetryLine';
import { cx, fieldCls, fieldErrorCls, h2Cls, helpCls, inputCls, labelCls, linkBtn, primaryBtn, quietLinkBtn, secondaryBtn } from '../auth/ui';
import { deadlineIn, useSecondsLeft } from '../auth/useCountdown';
import { Icon } from '../components/Icon';
import { errorKey } from '../cabinet/format';
import { SHOW_STUDENT_LOGIN } from '../config';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';

type Tab = 'student' | 'adult';

/** Where to go after signing in (`?next=/ky/bio/g8/human-heart`); same-site paths only. */
function useNextPath(): string | null {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : null;
}

function useErrorText(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    if (isApiError(e) && e.code === 'pin_locked') {
      return t('auth.locked', { count: Math.max(1, Math.ceil((e.problem?.retryAfter ?? 900) / 60)) });
    }
    return t(errorKey(e));
  };
}

function ErrorLine({ id, text }: { id: string; text: string | null }): JSX.Element {
  return (
    <p id={id} className="error-text" role="alert" aria-live="assertive">
      {text ?? ''}
    </p>
  );
}

export default function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.me);
  const setContext = useUi((s) => s.setContext);
  const [tab, setTab] = useState<Tab>(SHOW_STUDENT_LOGIN ? 'student' : 'adult');
  useEffect(() => setContext(null), [setContext]);

  return (
    <AuthLayout
      titleId="auth-title"
      title={t('auth.title')}
      lead={SHOW_STUDENT_LOGIN ? t('auth.leadWithStudents') : t('auth.lead')}
      points={[
        { icon: 'cube', text: t('auth.point.model') },
        { icon: 'chat', text: t('auth.point.tutor') },
        { icon: 'target', text: t('auth.point.progress') },
      ]}
      cardLabel={SHOW_STUDENT_LOGIN ? t('auth.tabs') : undefined}
      cardLabelledBy={SHOW_STUDENT_LOGIN ? undefined : 'login-card-title'}
    >
      {me && (
        <div className="flex items-center gap-2 rounded-md bg-soft px-3 py-2 text-sm text-ink">
          <Icon name="check" className="sm" />
          <span>
            {t('auth.already', { name: me.displayName })}{' '}
            <Link className="font-semibold text-accent" to={`/${lang}`}>
              {t('auth.continue')}
            </Link>
          </span>
        </div>
      )}
      {SHOW_STUDENT_LOGIN ? (
        <>
          <div className="seg flat login-tabs" role="tablist" aria-label={t('auth.tabs')}>
            {(['student', 'adult'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`login-tab-${k}`}
                aria-selected={tab === k}
                aria-controls={`login-panel-${k}`}
                onClick={() => setTab(k)}
              >
                <Icon name={k === 'student' ? 'grad' : 'user'} className="sm" />
                {t(`auth.tab.${k}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`login-panel-${tab}`} aria-labelledby={`login-tab-${tab}`}>
            {tab === 'student' ? <StudentLogin /> : <AdultLogin />}
          </div>
        </>
      ) : (
        <AdultLogin titled />
      )}
    </AuthLayout>
  );
}

/** Progress through the three student steps (code → name → PIN). */
function StepDots({ n }: { n: number }): JSX.Element {
  return (
    <div className="auth__steps" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i <= n ? 'on' : undefined} />
      ))}
    </div>
  );
}

function StudentLogin(): JSX.Element {
  const next = useNextPath();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const [code, setCode] = useState('');
  const [cls, setCls] = useState<ClassCodeResponse | null>(null);
  const [student, setStudent] = useState<{ id: string; displayName: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (student) pinRef.current?.focus();
    else if (cls) headRef.current?.focus();
  }, [cls, student]);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) return setError(t('auth.error.codeFormat'));
    setBusy(true);
    setError(null);
    try {
      setCls(await lookupClassCode(c));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (e: FormEvent) => {
    e.preventDefault();
    if (!cls || !student) return;
    if (!/^\d{4,6}$/.test(pin)) return setError(t('auth.error.pinFormat'));
    setBusy(true);
    setError(null);
    try {
      await loginStudent(cls.classId, student.id, pin);
      navigate(next ?? `/${lang}`);
    } catch (err) {
      setError(errorText(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  if (!cls) {
    return (
      <form className="stack" onSubmit={submitCode} noValidate>
        <StepDots n={0} />
        <div className="field">
          <label htmlFor="class-code">{t('auth.student.codeLabel')}</label>
          <input
            id="class-code"
            className="input code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={6}
            aria-describedby="code-hint code-error"
            aria-invalid={!!error}
            autoFocus
          />
          <span id="code-hint" className="muted small">
            {t('auth.student.codeHint')}
          </span>
        </div>
        <ErrorLine id="code-error" text={error} />
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? t('auth.busy') : t('auth.student.continue')}
        </button>
        <p className="auth__note">
          <Icon name="shield" className="sm" />
          {t('auth.student.privacy')}
        </p>
      </form>
    );
  }

  if (!student) {
    return (
      <div className="stack">
        <StepDots n={1} />
        <h2 ref={headRef} tabIndex={-1}>
          {t('auth.student.pickName')}
        </h2>
        <p className="muted">{t('auth.student.className', { name: cls.className })}</p>
        <div className="name-grid">
          {cls.students.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn2"
              onClick={() => {
                setError(null);
                setStudent(s);
              }}
            >
              {s.displayName}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setCls(null);
            setError(null);
          }}
        >
          <Icon name="prev" className="sm" />
          {t('auth.student.changeCode')}
        </button>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submitPin} noValidate>
      <StepDots n={2} />
      <h2>{t('auth.student.hello', { name: student.displayName })}</h2>
      <div className="field">
        <label htmlFor="student-pin">{t('auth.student.pinLabel')}</label>
        <input
          id="student-pin"
          ref={pinRef}
          className="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-describedby="pin-hint pin-error"
          aria-invalid={!!error}
        />
        <span id="pin-hint" className="muted small">
          {t('auth.student.pinHint')}
        </span>
      </div>
      <ErrorLine id="pin-error" text={error} />
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? t('auth.busy') : t('auth.student.signIn')}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => {
          setStudent(null);
          setPin('');
          setError(null);
        }}
      >
        <Icon name="prev" className="sm" />
        {t('auth.student.changeName')}
      </button>
    </form>
  );
}

type Mode = 'phone' | 'email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Teacher (WhatsApp number) or staff (e-mail) sign-in. */
function AdultLogin({ titled }: { titled?: boolean }): JSX.Element {
  const next = useNextPath();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const loc = useLocation();
  const prefill = digitsOfE164((loc.state as { phone?: string } | null)?.phone);
  const [mode, setMode] = useState<Mode>('phone');
  const [digits, setDigits] = useState(prefill);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [errors, setErrors] = useState<{ id?: string; password?: string; totp?: string }>({});
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const wait = useSecondsLeft(retryAt);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const switched = useRef(false);

  // After «Sign in with e-mail» / «with the number», focus the new identifier field;
  // coming back from registration with a number, focus the password.
  useEffect(() => {
    if (switched.current) idRef.current?.focus();
    else if (prefill) pwRef.current?.focus();
    switched.current = false;
  }, [mode, prefill]);

  const idError = (): string | undefined => {
    if (mode === 'phone') {
      if (!digits) return t('register.error.phoneRequired');
      if (digits.length < 9) return t('register.error.phoneShort');
      return toE164(digits) ? undefined : t('register.error.phoneInvalid');
    }
    if (!email.trim()) return t('auth.error.emailRequired');
    return EMAIL_RE.test(email.trim()) ? undefined : t('auth.error.email');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || wait > 0) return;
    setProblem(null);
    const found = {
      id: idError(),
      password: password ? undefined : t('auth.error.passwordRequired'),
      totp: needTotp && !/^\d{6}$/.test(totp) ? t('auth.error.totp') : undefined,
    };
    setErrors(found);
    if (found.id || found.password || found.totp) return requestAnimationFrame(() => summary.current?.focus());
    const id: LoginId = mode === 'phone' ? { phone: toE164(digits)! } : { email: email.trim().toLowerCase() };
    setBusy(true);
    try {
      const res = await signIn(id, password, needTotp ? totp : undefined);
      if (res === 'totp') {
        setNeedTotp(true);
        setBusy(false);
        return;
      }
      navigate(next ?? (res.permissions.includes('class.manage') ? `/${lang}/teacher` : `/${lang}/cabinet`));
    } catch (err) {
      const p = classify(err, 'login');
      if (p.kind === 'rateLimited') setRetryAt(deadlineIn(p.retryAfter));
      if (p.kind === 'credentials') {
        // The server does not say which one is wrong: mark both, explain under the password (next to «Forgot password?»).
        const text = problemText(p, t, { byPhone: mode === 'phone' });
        setErrors({ id: ' ', password: text });
      } else setProblem(p);
      setBusy(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  };

  const switchMode = () => {
    switched.current = true;
    setErrors({});
    setProblem(null);
    setMode((m) => (m === 'phone' ? 'email' : 'phone'));
  };

  const idFieldId = mode === 'phone' ? 'login-phone' : 'login-email';
  const items = [
    ...(errors.id?.trim() ? [{ text: errors.id, fieldId: idFieldId }] : []),
    ...(errors.password ? [{ text: errors.password, fieldId: 'login-password' }] : []),
    ...(errors.totp ? [{ text: errors.totp, fieldId: 'login-totp' }] : []),
    ...(problem ? [{ text: problemText(problem, t, { byPhone: mode === 'phone' }) }] : []),
  ];
  const e164 = toE164(digits);

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate aria-labelledby={titled ? 'login-card-title' : undefined}>
      {titled && (
        <div className="grid gap-1">
          <h2 id="login-card-title" className={h2Cls}>
            {mode === 'phone' ? t('auth.adult.titlePhone') : t('auth.adult.titleEmail')}
          </h2>
          <p className={helpCls}>{mode === 'phone' ? t('auth.adult.leadPhone') : t('auth.adult.leadEmail')}</p>
        </div>
      )}
      <ErrorSummary id="login-summary" summaryRef={summary} title={t('auth.error.summary')} items={items} />
      {mode === 'phone' ? (
        <PhoneField
          ref={idRef}
          id="login-phone"
          label={t('auth.adult.phone')}
          value={digits}
          error={errors.id}
          onChange={(d) => {
            setDigits(d);
            if (errors.id && toE164(d)) setErrors((x) => ({ ...x, id: undefined }));
          }}
          onBlur={() => digits && setErrors((x) => ({ ...x, id: idError() }))}
        />
      ) : (
        <div className={fieldCls}>
          <label htmlFor="login-email" className={labelCls}>
            {t('auth.adult.email')}
          </label>
          <input
            ref={idRef}
            id="login-email"
            className={inputCls}
            type="email"
            inputMode="email"
            autoComplete="username"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.id) setErrors((x) => ({ ...x, id: undefined }));
            }}
            onBlur={() => email && setErrors((x) => ({ ...x, id: idError() }))}
            aria-invalid={errors.id ? true : undefined}
            aria-describedby="login-email-error"
          />
          <p id="login-email-error" className={fieldErrorCls} aria-live="polite">
            {errors.id?.trim() ?? ''}
          </p>
        </div>
      )}
      <PasswordField
        ref={pwRef}
        id="login-password"
        label={t('auth.adult.password')}
        autoComplete="current-password"
        value={password}
        error={errors.password}
        onChange={(v) => {
          setPassword(v);
          if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
        }}
        labelAside={
          mode === 'phone' ? (
            <Link className={cx(linkBtn, '-mr-2')} to={`/${lang}/reset`} state={e164 ? { phone: e164 } : undefined}>
              {t('auth.adult.forgot')}
            </Link>
          ) : undefined
        }
      />
      {needTotp && (
        <div className={fieldCls}>
          <label htmlFor="login-totp" className={labelCls}>
            {t('auth.adult.totp')}
          </label>
          <input
            id="login-totp"
            className={cx(inputCls, 'tracking-[0.3em] tabular-nums')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
            autoFocus
            aria-invalid={errors.totp ? true : undefined}
            aria-describedby="login-totp-hint login-totp-error"
          />
          <p id="login-totp-hint" className={helpCls}>
            {t('auth.adult.totpHint')}
          </p>
          <p id="login-totp-error" className={fieldErrorCls} aria-live="polite">
            {errors.totp ?? ''}
          </p>
        </div>
      )}
      <button type="submit" className={primaryBtn} disabled={busy || wait > 0}>
        {busy ? t('auth.busy') : t('auth.adult.signIn')}
      </button>
      {retryAt !== null && <RetryLine secondsLeft={wait} waiting={(time) => t('register.error.retryIn', { time })} ready={t('register.error.retryNow')} />}
      <div className="grid gap-2 border-t border-line pt-4">
        <p className="m-0 text-center text-sm text-muted">{t('auth.adult.noAccount')}</p>
        <Link className={secondaryBtn} to={`/${lang}/register`}>
          <Icon name="grad" className="sm" />
          {t('auth.adult.register')}
        </Link>
      </div>
      <p className="m-0 text-center">
        <button type="button" className={quietLinkBtn} onClick={switchMode}>
          <Icon name={mode === 'phone' ? 'mail' : 'chat'} className="sm" />
          {mode === 'phone' ? t('auth.adult.useEmail') : t('auth.adult.usePhone')}
        </button>
      </p>
    </form>
  );
}
