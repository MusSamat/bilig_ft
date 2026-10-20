/**
 * Phone-first account flow (contract 0.7.0), shared by registration and password
 * reset: 1 WhatsApp number → POST /auth/otp/start; 2 the 6-digit code →
 * POST /auth/otp/verify gives a short-lived token, kept in this component's memory
 * only; 3 the password twice → POST /auth/register/complete or /auth/password/set,
 * which sign in. One primary action per step; focus goes to the step's first field,
 * and to the error summary when a submit fails.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatKgPhone, type MeResponse, type OtpPurpose, type OtpStartResponse } from '@bilig/content-model/api';
import { completeWithPassword, startOtp, verifyOtp } from '../api/session';
import { ErrorSummary } from '../auth/AuthLayout';
import { classify, problemText, type AuthProblem } from '../auth/errors';
import { PasswordField } from '../auth/PasswordField';
import { PhoneField } from '../auth/PhoneField';
import { digitsOfE164, toE164 } from '../auth/phone';
import { RetryLine } from '../auth/RetryLine';
import { cx, h2Cls, helpCls, linkBtn, primaryBtn, secondaryBtn } from '../auth/ui';
import { deadlineIn, useSecondsLeft } from '../auth/useCountdown';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { CODE_LENGTH, CodeInput, emptyCode, type CodeDigits, type CodeInputHandle } from './CodeInput';
import { MIN_PASSWORD } from './password';

type Step = 'phone' | 'code' | 'password';
const STEPS: Step[] = ['phone', 'code', 'password'];

interface Sent {
  expiresIn: number;
  resendAt: number;
}

interface Props {
  purpose: OtpPurpose;
  /** Called right before the final request: the page must not redirect a signed-in user mid-flow. */
  setFinishing: (v: boolean) => void;
}

/** Number prefilled from navigation state (`{ phone: '+996…' }`, e.g. from the login form). */
function usePrefill(): string {
  const loc = useLocation();
  const phone = (loc.state as { phone?: unknown } | null)?.phone;
  return digitsOfE164(typeof phone === 'string' ? phone : undefined);
}

export function OtpWizard({ purpose, setFinishing }: Props): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('phone');
  const prefill = usePrefill();
  const [digits, setDigits] = useState(prefill);
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);
  /** The verified-number token: memory only, never stored. */
  const token = useRef<string | null>(null);
  const [taken, setTaken] = useState(false);

  const onSent = (e164: string, r: OtpStartResponse) => {
    setPhone(e164);
    setSent({ expiresIn: r.expiresIn, resendAt: deadlineIn(r.resendAfter) });
    setStep('code');
  };

  const done = (me: MeResponse) => {
    if (purpose === 'register') navigate(`/${lang}/teacher?welcome=1`, { replace: true });
    else navigate(me.permissions.includes('class.manage') ? `/${lang}/teacher` : `/${lang}/cabinet`, { replace: true });
  };

  const restart = () => {
    token.current = null;
    setTaken(false);
    setStep('phone');
  };

  return (
    <div className="grid gap-5">
      <StepIndicator current={STEPS.indexOf(step)} />
      {taken ? (
        <TakenPanel phone={phone} />
      ) : step === 'phone' ? (
        <PhoneStep purpose={purpose} digits={digits} setDigits={setDigits} onSent={onSent} />
      ) : step === 'code' ? (
        <CodeStep
          purpose={purpose}
          phone={phone}
          sent={sent!}
          onResent={(r) => setSent({ expiresIn: r.expiresIn, resendAt: deadlineIn(r.resendAfter) })}
          onWait={(s) => setSent((x) => (x ? { ...x, resendAt: deadlineIn(s) } : x))}
          onVerified={(tok) => {
            token.current = tok;
            setStep('password');
          }}
          onChangePhone={() => setStep('phone')}
          onTaken={() => setTaken(true)}
        />
      ) : (
        <PasswordStep
          purpose={purpose}
          submit={async (password) => {
            setFinishing(true);
            try {
              const me = await completeWithPassword(purpose, token.current ?? '', password);
              token.current = null;
              done(me);
            } catch (err) {
              setFinishing(false);
              throw err;
            }
          }}
          onRestart={restart}
          onTaken={() => setTaken(true)}
        />
      )}
      {!taken && step === 'phone' && (
        <p className="m-0 flex flex-wrap items-center gap-x-1 border-t border-line pt-3 text-sm text-muted">
          {purpose === 'register' ? t('register.haveAccount') : t('register.reset.remember')}
          <Link className={linkBtn} to={`/${lang}/login`}>
            {t('register.signIn')}
          </Link>
        </p>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: number }): JSX.Element {
  const { t } = useTranslation();
  return (
    <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label={t('register.steps.label')}>
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className="grid gap-1.5" aria-current={state === 'current' ? 'step' : undefined}>
            <span className={cx('h-1.5 rounded-pill', state === 'todo' ? 'bg-line' : 'bg-accent')} aria-hidden="true" />
            <span className={cx('flex items-center gap-1.5 text-sm', state === 'current' ? 'font-bold text-ink' : 'text-muted')}>
              <span
                className={cx(
                  'inline-grid size-6 shrink-0 place-items-center rounded-full text-sm font-bold',
                  state === 'todo' ? 'border border-line text-muted' : 'bg-accent text-on',
                )}
                aria-hidden="true"
              >
                {state === 'done' ? <Icon name="check" size={14} /> : i + 1}
              </span>
              {t(`register.steps.${s}`)}
              {state === 'done' && <span className="sr-only">{t('register.steps.done')}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Focus an element once mounted (the step's first field). */
function useFocusOnMount<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

// ---- Step 1: number ---------------------------------------------------------

function phoneError(digits: string, t: ReturnType<typeof useTranslation>['t']): string | null {
  if (!digits) return t('register.error.phoneRequired');
  if (digits.length < 9) return t('register.error.phoneShort');
  return toE164(digits) ? null : t('register.error.phoneInvalid');
}

function PhoneStep({ purpose, digits, setDigits, onSent }: { purpose: OtpPurpose; digits: string; setDigits: (d: string) => void; onSent: (e164: string, r: OtpStartResponse) => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const input = useFocusOnMount<HTMLInputElement>();
  const summary = useRef<HTMLDivElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const wait = useSecondsLeft(retryAt);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || wait > 0) return;
    setProblem(null);
    const err = phoneError(digits, t);
    setFieldError(err);
    if (err) return requestAnimationFrame(() => summary.current?.focus());
    setBusy(true);
    try {
      const e164 = toE164(digits)!;
      onSent(e164, await startOtp(e164, purpose, lang));
    } catch (x) {
      const p = classify(x, 'start');
      if (p.kind === 'rateLimited') setRetryAt(deadlineIn(p.retryAfter));
      if (p.kind === 'phone') setFieldError(problemText(p, t));
      else setProblem(p);
      setBusy(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  };

  const items = [...(fieldError ? [{ text: fieldError, fieldId: 'otp-phone' }] : []), ...(problem ? [{ text: problemText(problem, t) }] : [])];

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate aria-labelledby="otp-step-title">
      <div className="grid gap-1">
        <h2 id="otp-step-title" className={h2Cls}>
          {purpose === 'register' ? t('register.phone.title') : t('register.reset.phoneTitle')}
        </h2>
        <p className={helpCls}>{purpose === 'register' ? t('register.phone.lead') : t('register.reset.phoneLead')}</p>
      </div>
      <ErrorSummary id="otp-summary" summaryRef={summary} title={t('register.error.summary')} items={items} />
      <PhoneField
        ref={input}
        id="otp-phone"
        label={t('register.phone.label')}
        hint={t('register.phone.hint')}
        value={digits}
        error={fieldError}
        onChange={(d) => {
          setDigits(d);
          if (fieldError && !phoneError(d, t)) setFieldError(null);
        }}
        onBlur={() => digits && setFieldError(phoneError(digits, t))}
      />
      <button type="submit" className={primaryBtn} disabled={busy || wait > 0} aria-describedby={wait > 0 ? 'otp-phone-wait' : undefined}>
        {busy ? t('register.phone.sending') : t('register.phone.submit')}
      </button>
      {retryAt !== null && (
        <div id="otp-phone-wait">
          <RetryLine secondsLeft={wait} waiting={(time) => t('register.error.retryIn', { time })} ready={t('register.error.retryNow')} testId="retry-wait" />
        </div>
      )}
    </form>
  );
}

// ---- Step 2: code -----------------------------------------------------------

interface CodeStepProps {
  purpose: OtpPurpose;
  phone: string;
  sent: Sent;
  onResent: (r: OtpStartResponse) => void;
  onWait: (seconds: number) => void;
  onVerified: (token: string) => void;
  onChangePhone: () => void;
  onTaken: () => void;
}

function CodeStep({ purpose, phone, sent, onResent, onWait, onVerified, onChangePhone, onTaken }: CodeStepProps): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const [code, setCode] = useState<CodeDigits>(emptyCode);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const busyRef = useRef(false);
  const boxes = useRef<CodeInputHandle>(null);
  const left = useSecondsLeft(sent.resendAt);
  const locked = useSecondsLeft(retryAt);

  useEffect(() => {
    boxes.current?.focus(0);
  }, []);

  const fail = (text: string) => {
    setError(text);
    setCode(emptyCode());
    requestAnimationFrame(() => boxes.current?.focus(0));
  };

  const verify = async (value: string) => {
    if (busyRef.current) return;
    if (!/^\d{6}$/.test(value)) {
      setError(t('register.code.incomplete', { n: CODE_LENGTH }));
      boxes.current?.focus(value.length);
      return;
    }
    if (locked > 0) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const res = await verifyOtp(phone, purpose, value);
      onVerified(res.token);
    } catch (err) {
      busyRef.current = false;
      setBusy(false);
      const p = classify(err, 'verify');
      if (p.kind === 'taken') return onTaken();
      if (p.kind === 'codeExpired') setExpired(true);
      if (p.kind === 'rateLimited') setRetryAt(deadlineIn(p.retryAfter));
      fail(problemText(p, t));
    }
  };

  const resend = async () => {
    setError(null);
    setNotice('');
    try {
      onResent(await startOtp(phone, purpose, lang));
      setExpired(false);
      setCode(emptyCode());
      setNotice(t('register.code.resent'));
      boxes.current?.focus(0);
    } catch (err) {
      const p = classify(err, 'start');
      if (p.kind === 'rateLimited') onWait(p.retryAfter);
      else setError(problemText(p, t));
    }
  };

  const minutes = Math.max(1, Math.round(sent.expiresIn / 60));

  return (
    <form
      className="grid gap-4"
      noValidate
      aria-labelledby="otp-step-title"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code.join(''));
      }}
    >
      <div className="grid gap-1">
        <h2 id="otp-step-title" className={h2Cls}>
          {t('register.code.title')}
        </h2>
        <p id="otp-code-sent" className="m-0 text-ink">
          {t('register.code.sent', { phone: formatKgPhone(phone) })} {t('register.code.valid', { count: minutes })}
        </p>
        <div>
          <button type="button" className={cx(linkBtn, '-ml-2')} onClick={onChangePhone} disabled={busy}>
            <Icon name="pencil" className="sm" />
            {t('register.code.changePhone')}
          </button>
        </div>
      </div>
      <span id="otp-code-label" className="sr-only">
        {t('register.code.label', { n: CODE_LENGTH })}
      </span>
      <CodeInput
        ref={boxes}
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error && !expired) setError(null);
        }}
        onComplete={(v) => void verify(v)}
        labelledBy="otp-code-label"
        describedBy="otp-code-sent otp-code-error"
        invalid={!!error}
        disabled={busy}
      />
      <p id="otp-code-error" className="m-0 flex items-start gap-2 font-semibold text-bad empty:hidden" role="alert">
        {error ?? ''}
      </p>
      <p className="m-0 text-sm font-semibold text-ok empty:hidden" role="status">
        {notice}
      </p>
      {locked > 0 && <RetryLine secondsLeft={locked} waiting={(time) => t('register.error.retryIn', { time })} ready={t('register.error.retryNow')} />}
      {expired && left <= 0 ? (
        <button type="button" className={primaryBtn} onClick={() => void resend()} disabled={busy}>
          {t('register.code.resendNew')}
        </button>
      ) : (
        <button type="submit" className={primaryBtn} disabled={busy || locked > 0}>
          {busy ? t('auth.busy') : t('register.code.confirm')}
        </button>
      )}
      <div className="grid justify-items-start gap-1 border-t border-line pt-3">
        <p className={helpCls}>{t('register.code.help')}</p>
        <RetryLine secondsLeft={left} waiting={(time) => t('register.code.wait', { time })} ready={t('register.code.resendReady')} testId="resend-wait" />
        {left <= 0 && !expired && (
          <button type="button" className={cx(linkBtn, '-ml-2')} onClick={() => void resend()} disabled={busy}>
            <Icon name="sync" className="sm" />
            {t('register.code.resend')}
          </button>
        )}
      </div>
    </form>
  );
}

// ---- Step 3: password -------------------------------------------------------

type PwField = 'pw' | 'pw2';

function PasswordStep({ purpose, submit, onRestart, onTaken }: { purpose: OtpPurpose; submit: (password: string) => Promise<void>; onRestart: () => void; onTaken: () => void }): JSX.Element {
  const { t } = useTranslation();
  const first = useFocusOnMount<HTMLInputElement>();
  const summary = useRef<HTMLDivElement>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<Partial<Record<PwField, string>>>({});
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched2, setTouched2] = useState(false);

  const short = (v: string) => [...v].length < MIN_PASSWORD;
  const pwError = (v: string) => (!v ? t('register.error.passwordRequired') : short(v) ? t('register.error.passwordShort', { n: MIN_PASSWORD }) : undefined);
  const pw2Error = (a: string, b: string) => (!b ? t('register.error.repeatRequired') : a !== b ? t('register.password.mismatch') : undefined);
  // Live: the repeat field says «match» / «do not match» as soon as it is as long as the password.
  const liveMismatch = pw2 && (touched2 || [...pw2].length >= [...pw].length) && pw !== pw2;
  const shownPw2Error = errors.pw2 ?? (liveMismatch ? t('register.password.mismatch') : undefined);
  const match = pw2 && pw === pw2 && !short(pw);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setProblem(null);
    const found = { pw: pwError(pw), pw2: pw2Error(pw, pw2) };
    setErrors(found);
    if (found.pw || found.pw2) {
      setTouched2(true);
      return requestAnimationFrame(() => summary.current?.focus());
    }
    setBusy(true);
    try {
      await submit(pw);
    } catch (err) {
      setBusy(false);
      const p = classify(err, 'complete');
      if (p.kind === 'taken') return onTaken();
      if (p.kind === 'weak') setErrors({ pw: problemText(p, t) });
      else setProblem(p);
      requestAnimationFrame(() => summary.current?.focus());
    }
  };

  const items = [
    ...(errors.pw ? [{ text: errors.pw, fieldId: 'otp-pw' }] : []),
    ...(shownPw2Error && (errors.pw2 || errors.pw) ? [{ text: shownPw2Error, fieldId: 'otp-pw2' }] : []),
    ...(problem ? [{ text: problemText(problem, t) }] : []),
  ];

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate aria-labelledby="otp-step-title">
      <div className="grid gap-1">
        <h2 id="otp-step-title" className={h2Cls}>
          {purpose === 'register' ? t('register.password.title') : t('register.reset.passwordTitle')}
        </h2>
        <p className={helpCls}>{purpose === 'register' ? t('register.password.lead') : t('register.reset.passwordLead')}</p>
      </div>
      <ErrorSummary id="otp-summary" summaryRef={summary} title={t('register.error.summary')} items={items} />
      <PasswordField
        ref={first}
        id="otp-pw"
        label={purpose === 'register' ? t('register.password.label') : t('register.password.newLabel')}
        autoComplete="new-password"
        meter
        hint={t('register.password.hint', { n: MIN_PASSWORD })}
        value={pw}
        error={errors.pw}
        onChange={(v) => {
          setPw(v);
          if (errors.pw && !pwError(v)) setErrors((x) => ({ ...x, pw: undefined }));
          if (errors.pw2) setErrors((x) => ({ ...x, pw2: undefined }));
        }}
        onBlur={() => pw && setErrors((x) => ({ ...x, pw: pwError(pw) }))}
      />
      <PasswordField
        id="otp-pw2"
        label={t('register.password.repeat')}
        autoComplete="new-password"
        value={pw2}
        error={shownPw2Error}
        status={
          match ? (
            <>
              <Icon name="check" className="sm" />
              {t('register.password.match')}
            </>
          ) : null
        }
        onChange={(v) => {
          setPw2(v);
          if (errors.pw2) setErrors((x) => ({ ...x, pw2: undefined }));
        }}
        onBlur={() => pw2 && setTouched2(true)}
      />
      <button type="submit" className={primaryBtn} disabled={busy}>
        {busy ? t('register.password.saving') : purpose === 'register' ? t('register.password.submit') : t('register.reset.submit')}
      </button>
      {problem?.kind === 'tokenExpired' && (
        <button type="button" className={secondaryBtn} onClick={onRestart}>
          <Icon name="prev" className="sm" />
          {t('register.error.restart')}
        </button>
      )}
    </form>
  );
}

// ---- 409: the number already has an account ---------------------------------

function TakenPanel({ phone }: { phone: string }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const head = useFocusOnMount<HTMLHeadingElement>();
  return (
    <div className="grid gap-4" role="region" aria-labelledby="otp-taken-title">
      <div className="grid gap-1">
        <h2 id="otp-taken-title" ref={head} tabIndex={-1} className={h2Cls}>
          {t('register.taken.title')}
        </h2>
        <p className="m-0 text-ink">{t('register.taken.text', { phone: formatKgPhone(phone) })}</p>
      </div>
      <Link className={primaryBtn} to={`/${lang}/login`} state={{ phone }}>
        {t('register.taken.signIn')}
      </Link>
      <Link className={secondaryBtn} to={`/${lang}/reset`} state={{ phone }}>
        {t('register.taken.reset')}
      </Link>
    </div>
  );
}
