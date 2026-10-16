/**
 * Sign-in (TZ §6, scenario «Ученик» 1): students — class code → pick your name →
 * PIN (no e-mail); adults — e-mail + password (+ TOTP when required). The
 * access token stays in memory (session.ts); the refresh token is an HttpOnly cookie.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassCodeResponse } from '@bilig/content-model/api';
import { isApiError } from '../api/client';
import { loginAdult, loginStudent, lookupClassCode, useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { errorKey } from '../cabinet/format';
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
  const [tab, setTab] = useState<Tab>('student');
  useEffect(() => setContext(null), [setContext]);

  return (
    <div className="page">
      <div className="auth">
        <section className="auth__brand panel glass" aria-labelledby="auth-title">
          <div className="home-hero__brand">
            <LogoMark size={48} />
            <b aria-hidden="true">{t('app.title')}</b>
          </div>
          <h1 id="auth-title">{t('auth.title')}</h1>
          <p className="lead-text">{t('auth.lead')}</p>
          <ul className="auth__points">
            <li>
              <Icon name="cube" />
              {t('auth.point.model')}
            </li>
            <li>
              <Icon name="chat" />
              {t('auth.point.tutor')}
            </li>
            <li>
              <Icon name="target" />
              {t('auth.point.progress')}
            </li>
          </ul>
        </section>
        <section className="auth__card panel glass" aria-label={t('auth.tabs')}>
          {me && (
            <div className="soft-box">
              <Icon name="check" />
              <span>
                {t('auth.already', { name: me.displayName })}{' '}
                <Link to={`/${lang}`}>{t('auth.continue')}</Link>
              </span>
            </div>
          )}
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
        </section>
      </div>
    </div>
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

function AdultLogin(): JSX.Element {
  const next = useNextPath();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError(t('auth.error.required'));
    setBusy(true);
    setError(null);
    try {
      const res = await loginAdult(email.trim().toLowerCase(), password, needTotp ? totp : undefined);
      if (res === 'totp') {
        setNeedTotp(true);
        return;
      }
      navigate(next ?? (res.permissions.includes('class.manage') ? `/${lang}/teacher` : `/${lang}/cabinet`));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field">
        <span>{t('auth.adult.email')}</span>
        <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="adult-error" />
      </label>
      <label className="field">
        <span>{t('auth.adult.password')}</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="adult-error" />
      </label>
      {needTotp && (
        <div className="field">
          <label htmlFor="adult-totp">{t('auth.adult.totp')}</label>
          <input
            id="adult-totp"
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
            autoFocus
            aria-describedby="totp-hint"
          />
          <span id="totp-hint" className="muted small">
            {t('auth.adult.totpHint')}
          </span>
        </div>
      )}
      <ErrorLine id="adult-error" text={error} />
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? t('auth.busy') : t('auth.adult.signIn')}
      </button>
    </form>
  );
}
