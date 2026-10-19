/**
 * Teacher self-registration (contract 0.6.0), a lazy chunk at `/:lang/register`.
 * Step 1: name, e-mail, password, school and region (optional), subjects and
 * grades (the trial licence), UI language → POST /auth/register sends a code.
 * Step 2: the 6-digit code → POST /auth/register/verify signs in (like login) and
 * opens the teacher cabinet with a welcome banner. The account cannot sign in
 * before it is verified, so a half-registered session never exists. Signed-in
 * users are sent to their cabinet.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@bilig/content-model';
import type { RegisterRequest } from '@bilig/content-model/api';
import { isApiError } from '../api/client';
import { registerTeacher, resendRegistrationCode, useSession, verifyRegistration } from '../api/session';
import { errorKey } from '../cabinet/format';
import { GradePicker, SubjectPicker } from '../cabinet/teacher/TeachingPicker';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { UI_LANGS } from '../config';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';
import { CODE_LENGTH, CodeInput, emptyCode, type CodeDigits, type CodeInputHandle } from './CodeInput';
import { MIN_PASSWORD, passwordStrength } from './password';
import { REGIONS } from './regions';

type Field = 'name' | 'email' | 'password' | 'schoolName' | 'subjects' | 'grades';
type Errors = Partial<Record<Field, string>>;

interface Form {
  name: string;
  email: string;
  password: string;
  schoolName: string;
  region: string;
  subjects: string[];
  grades: number[];
  locale: Lang;
}

/** Field order: the first invalid one gets focus. Ids of the focusable element per field. */
const FIELD_IDS: Record<Field, string> = {
  name: 'reg-name',
  email: 'reg-email',
  password: 'reg-password',
  schoolName: 'reg-school',
  subjects: 'reg-subjects',
  grades: 'reg-grades',
};
const FIELDS = Object.keys(FIELD_IDS) as Field[];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function focusField(f: Field): void {
  const el = document.getElementById(FIELD_IDS[f]);
  const target = el?.tagName === 'FIELDSET' ? el.querySelector<HTMLElement>('button') : el;
  target?.focus();
}

/** Seconds left until `deadline` (ms), ticking once a second. */
function useSecondsLeft(deadline: number): number {
  const calc = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (deadline <= Date.now()) return;
    const id = window.setInterval(() => {
      const v = calc();
      setLeft(v);
      if (v <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);
  return left;
}

export default function RegisterPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.me);
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);

  const [form, setForm] = useState<Form>(() => ({ name: '', email: '', password: '', schoolName: '', region: '', subjects: [], grades: [], locale: lang }));
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [sent, setSent] = useState<{ expiresIn: number; resendAt: number } | null>(null);
  /** Set while the code is being confirmed: the session turns «authed» before we navigate. */
  const [finishing, setFinishing] = useState(false);

  if (status === 'loading') {
    return (
      <div className="page" aria-busy="true" aria-label={t('common.loading')}>
        <span className="panel glass skel" style={{ height: 420 }} />
      </div>
    );
  }
  if (me && !finishing) {
    return <Navigate to={me.permissions.includes('class.manage') ? `/${lang}/teacher` : `/${lang}/cabinet`} replace />;
  }

  return (
    <div className="page">
      <div className="auth">
        <section className="auth__brand panel glass" aria-labelledby="reg-title">
          <div className="home-hero__brand">
            <LogoMark size={48} />
            <b aria-hidden="true">{t('app.title')}</b>
          </div>
          <h1 id="reg-title">{t('register.title')}</h1>
          <p className="lead-text">{t('register.lead')}</p>
          <ul className="auth__points">
            <li>
              <Icon name="users" />
              {t('register.point.classes')}
            </li>
            <li>
              <Icon name="book" />
              {t('register.point.textbook')}
            </li>
            <li>
              <Icon name="cal" />
              {t('register.point.ktp')}
            </li>
          </ul>
          <p className="auth__note">
            <Icon name="clock" className="sm" />
            {t('register.trialNote')}
          </p>
        </section>
        <section className="auth__card panel glass" aria-labelledby={step === 'form' ? 'reg-step1' : 'reg-step2'}>
          <div className="auth__steps" aria-hidden="true">
            <span className="on" />
            <span className={step === 'code' ? 'on' : undefined} />
          </div>
          {step === 'form' ? (
            <StepForm
              form={form}
              setForm={setForm}
              onSent={(r) => {
                setSent({ expiresIn: r.expiresIn, resendAt: Date.now() + r.resendAfter * 1000 });
                setStep('code');
              }}
            />
          ) : (
            <StepCode
              email={form.email.trim().toLowerCase()}
              expiresIn={sent?.expiresIn ?? 900}
              resendAt={sent?.resendAt ?? 0}
              onResent={(r) => setSent({ expiresIn: r.expiresIn, resendAt: Date.now() + r.resendAfter * 1000 })}
              onBack={() => {
                setStep('form');
                requestAnimationFrame(() => focusField('email'));
              }}
              setFinishing={setFinishing}
              locale={form.locale}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function StepForm({ form, setForm, onSent }: { form: Form; setForm: (f: (prev: Form) => Form) => void; onSent: (r: { expiresIn: number; resendAfter: number }) => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const strength = passwordStrength(form.password);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.name.trim()) e.name = t('register.error.name');
    if (!form.email.trim()) e.email = t('register.error.emailRequired');
    else if (!EMAIL_RE.test(form.email.trim())) e.email = t('register.error.email');
    if ([...form.password].length < MIN_PASSWORD) e.password = t('register.error.passwordShort', { n: MIN_PASSWORD });
    if (form.schoolName.trim() && form.schoolName.trim().length < 2) e.schoolName = t('register.error.school');
    if (!form.subjects.length) e.subjects = t('register.error.subjects');
    if (!form.grades.length) e.grades = t('register.error.grades');
    return e;
  };

  const serverErrors = (err: unknown): { field?: Errors; form?: string } => {
    if (!isApiError(err)) return { form: t('common.error') };
    if (err.code === 'password_weak') {
      const d = err.problem?.detail;
      return { field: { password: t(d === 'leaked' || d === 'too_simple' || d === 'too_short' ? `register.error.weak.${d}` : 'register.error.weak.other', { n: MIN_PASSWORD }) } };
    }
    if (err.code === 'validation_failed' && err.problem?.issues?.length) {
      const map: Record<string, Field> = { displayName: 'name', email: 'email', password: 'password', schoolName: 'schoolName', teaching: 'subjects' };
      const field: Errors = {};
      for (const i of err.problem.issues) {
        const f = map[String(i.path[0])];
        if (f === 'subjects' && i.path[1] === 'grades') field.grades = t('register.error.grades');
        else if (f) field[f] ??= t(`register.error.server.${f}`);
      }
      if (Object.keys(field).length) return { field };
    }
    if (err.code === 'rate_limited') return { form: t('register.error.rateLimited', { count: Math.max(1, Math.ceil((err.problem?.retryAfter ?? 60) / 60)) }) };
    return { form: t(errorKey(err)) };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const found = validate();
    setErrors(found);
    const first = FIELDS.find((f) => found[f]);
    if (first) return focusField(first);
    setBusy(true);
    const body: RegisterRequest = {
      email: form.email.trim().toLowerCase(),
      password: form.password,
      displayName: form.name.trim(),
      locale: form.locale,
      teaching: { subjects: form.subjects, grades: form.grades },
      ...(form.schoolName.trim() ? { schoolName: form.schoolName.trim() } : {}),
      ...(form.region ? { region: form.region } : {}),
    };
    try {
      onSent(await registerTeacher(body));
    } catch (err) {
      const r = serverErrors(err);
      if (r.field) {
        setErrors(r.field);
        const f = FIELDS.find((x) => r.field![x]);
        if (f) focusField(f);
      } else setFormError(r.form ?? null);
    } finally {
      setBusy(false);
    }
  };

  const describe = (f: Field, ...extra: string[]) => [...extra, `${FIELD_IDS[f]}-error`].join(' ');

  return (
    <form className="stack" onSubmit={submit} noValidate aria-labelledby="reg-step1">
      <h2 id="reg-step1">{t('register.step1')}</h2>
      <div className="field">
        <label htmlFor="reg-name">{t('register.name')}</label>
        <input
          id="reg-name"
          className="input"
          autoComplete="name"
          maxLength={100}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={!!errors.name || undefined}
          aria-describedby={describe('name')}
          required
        />
        <FieldError id="reg-name-error" text={errors.name} />
      </div>
      <div className="field">
        <label htmlFor="reg-email">{t('register.email')}</label>
        <input
          id="reg-email"
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          maxLength={254}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          aria-invalid={!!errors.email || undefined}
          aria-describedby={describe('email', 'reg-email-hint')}
          required
        />
        <span id="reg-email-hint" className="muted small">
          {t('register.emailHint')}
        </span>
        <FieldError id="reg-email-error" text={errors.email} />
      </div>
      <div className="field">
        <label htmlFor="reg-password">{t('register.password')}</label>
        <div className="pw">
          <input
            id="reg-password"
            className="input"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            maxLength={256}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            aria-invalid={!!errors.password || undefined}
            aria-describedby={describe('password', 'reg-password-hint')}
            required
          />
          <button type="button" className="ibtn pw__toggle" aria-pressed={showPw} aria-controls="reg-password" aria-label={t('register.showPassword')} title={t('register.showPassword')} onClick={() => setShowPw((v) => !v)}>
            <Icon name={showPw ? 'eyeoff' : 'eye'} />
          </button>
        </div>
        <div className={`pw-meter pw-meter--${strength}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span id="reg-password-hint" className="muted small" aria-live="polite">
          {strength === 'empty' ? t('register.passwordHint', { n: MIN_PASSWORD }) : t(`register.strength.${strength}`, { n: MIN_PASSWORD })}
        </span>
        <FieldError id="reg-password-error" text={errors.password} />
      </div>
      <div className="grid-2 reg-pair">
        <div className="field">
          <label htmlFor="reg-school">{t('register.school')}</label>
          <input
            id="reg-school"
            className="input"
            autoComplete="organization"
            maxLength={200}
            value={form.schoolName}
            placeholder={t('register.schoolPlaceholder')}
            onChange={(e) => set('schoolName', e.target.value)}
            aria-invalid={!!errors.schoolName || undefined}
            aria-describedby={describe('schoolName', 'reg-school-hint')}
          />
          <span id="reg-school-hint" className="muted small">
            {t('register.schoolHint')}
          </span>
          <FieldError id="reg-school-error" text={errors.schoolName} />
        </div>
        <div className="field">
          <label htmlFor="reg-region">{t('register.region.label')}</label>
          <select id="reg-region" className="input" value={form.region} onChange={(e) => set('region', e.target.value)}>
            <option value="">{t('register.region.none')}</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {t(`register.region.${r}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SubjectPicker id="reg-subjects" value={form.subjects} onChange={(v) => set('subjects', v)} error={errors.subjects} />
      <GradePicker id="reg-grades" value={form.grades} onChange={(v) => set('grades', v)} error={errors.grades} />
      <div className="field">
        <label htmlFor="reg-locale">{t('register.locale')}</label>
        <select id="reg-locale" className="input" value={form.locale} onChange={(e) => set('locale', e.target.value as Lang)}>
          {UI_LANGS.map((l) => (
            <option key={l} value={l} lang={l}>
              {t(`header.langName.${l}`, { lng: l })}
            </option>
          ))}
        </select>
      </div>
      <p className="error-text" role="alert">
        {formError ?? ''}
      </p>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? t('register.sending') : t('register.getCode')}
      </button>
      <p className="muted small">
        {t('register.haveAccount')} <Link to={`/${lang}/login`}>{t('register.signIn')}</Link>
      </p>
    </form>
  );
}

function FieldError({ id, text }: { id: string; text?: string }): JSX.Element {
  return (
    <span id={id} className="error-text">
      {text ?? ''}
    </span>
  );
}

interface StepCodeProps {
  email: string;
  expiresIn: number;
  resendAt: number;
  locale: Lang;
  onResent: (r: { expiresIn: number; resendAfter: number }) => void;
  onBack: () => void;
  setFinishing: (v: boolean) => void;
}

function StepCode({ email, expiresIn, resendAt, locale, onResent, onBack, setFinishing }: StepCodeProps): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState<CodeDigits>(emptyCode);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const boxes = useRef<CodeInputHandle>(null);
  const left = useSecondsLeft(resendAt);

  useEffect(() => {
    boxes.current?.focus(0);
  }, []);

  const verify = async (value: string) => {
    if (busyRef.current) return;
    if (!/^\d{6}$/.test(value)) {
      setError(t('register.code.incomplete', { n: CODE_LENGTH }));
      boxes.current?.focus(value.length);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setFinishing(true);
    try {
      await verifyRegistration(email, value);
      navigate(`/${locale}/teacher?welcome=1`, { replace: true });
    } catch (err) {
      setFinishing(false);
      setError(codeErrorText(err, t));
      setCode(emptyCode());
      busyRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => boxes.current?.focus(0));
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    try {
      onResent(await resendRegistrationCode(email));
      setCode(emptyCode());
      setNotice(t('register.code.resent'));
      boxes.current?.focus(0);
    } catch (err) {
      if (isApiError(err) && err.code === 'rate_limited') onResent({ expiresIn, resendAfter: err.problem?.retryAfter ?? 60 });
      else setError(t(errorKey(err)));
    }
  };

  return (
    <form
      className="stack"
      noValidate
      aria-labelledby="reg-step2"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code.join(''));
      }}
    >
      <h2 id="reg-step2">{t('register.code.title')}</h2>
      <p id="reg-code-sent">
        {t('register.code.sent', { email })} {t('register.code.valid', { count: Math.max(1, Math.round(expiresIn / 60)) })}
      </p>
      <span id="reg-code-label" className="visually-hidden">
        {t('register.code.label', { n: CODE_LENGTH })}
      </span>
      <CodeInput
        ref={boxes}
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        onComplete={(v) => void verify(v)}
        labelledBy="reg-code-label"
        describedBy="reg-code-sent reg-code-error"
        invalid={!!error}
        disabled={busy}
      />
      <p id="reg-code-error" className="error-text" role="alert">
        {error ?? ''}
      </p>
      <p className="muted small" role="status">
        {notice ?? ''}
      </p>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? t('auth.busy') : t('register.code.confirm')}
      </button>
      <div className="reg-help">
        <p className="muted small">{t('register.code.spam')}</p>
        {left > 0 ? (
          <p className="muted small" data-testid="resend-wait">
            {t('register.code.wait', { count: left })}
          </p>
        ) : (
          <button type="button" className="btn2 btn--sm" onClick={() => void resend()} disabled={busy}>
            <Icon name="mail" className="sm" />
            {t('register.code.resend')}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack} disabled={busy}>
          <Icon name="prev" className="sm" />
          {t('register.code.wrongEmail')}
        </button>
      </div>
    </form>
  );
}

function codeErrorText(err: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  if (!isApiError(err)) return t('common.error');
  const d = err.problem?.detail;
  if (d === 'code_expired') return t('register.code.expired');
  if (err.code === 'rate_limited') return t('register.code.tooMany', { count: Math.max(1, Math.ceil((err.problem?.retryAfter ?? 60) / 60)) });
  if (d === 'code_invalid' || err.code === 'invalid_credentials' || err.code === 'validation_failed' || err.code === 'not_found') return t('register.code.wrong');
  return t(errorKey(err));
}
