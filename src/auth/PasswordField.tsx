/**
 * Password input with a show/hide toggle (aria-pressed), optional strength meter
 * and hint. Labels sit above the field; the error line is linked by aria-describedby.
 */
import { forwardRef, useState, type FocusEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { MIN_PASSWORD, passwordStrength, type Strength } from '../register/password';
import { cx, fieldCls, fieldErrorCls, helpCls, iconBtn, inputCls, labelCls } from './ui';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  /** Live line under the field (e.g. «Passwords match»), announced politely. */
  status?: ReactNode;
  error?: string | null;
  /** Show the strength meter and a strength hint instead of `hint` once typing starts. */
  meter?: boolean;
  /** Extra element at the end of the label row (e.g. «Forgot password?»). */
  labelAside?: ReactNode;
  disabled?: boolean;
}

const METER: Record<Strength, string[]> = {
  empty: ['bg-line', 'bg-line', 'bg-line'],
  short: ['bg-bad', 'bg-line', 'bg-line'],
  fair: ['bg-gold', 'bg-gold', 'bg-line'],
  strong: ['bg-ok', 'bg-ok', 'bg-ok'],
};

export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { id, label, value, onChange, onBlur, autoComplete, hint, status, error, meter, labelAside, disabled },
  ref,
) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const strength = meter ? passwordStrength(value) : 'empty';
  const hintText = meter && strength !== 'empty' ? t(`register.strength.${strength}`, { n: MIN_PASSWORD }) : hint;
  const describedBy = [hintText ? `${id}-hint` : '', `${id}-status`, `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className={fieldCls}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <label htmlFor={id} className={labelCls}>
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          className={cx(inputCls, 'pr-14')}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={256}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className={cx(iconBtn, 'absolute inset-y-0 right-0.5 my-auto')}
          aria-pressed={shown}
          aria-controls={id}
          aria-label={t('register.password.show')}
          title={shown ? t('register.password.hide') : t('register.password.show')}
          disabled={disabled}
          onClick={() => setShown((v) => !v)}
        >
          <Icon name={shown ? 'eyeoff' : 'eye'} />
        </button>
      </div>
      {meter && (
        <div className="grid grid-cols-3 gap-1" aria-hidden="true" data-strength={strength}>
          {METER[strength].map((c, i) => (
            <span key={i} className={cx('h-1 rounded-pill transition-colors', c)} />
          ))}
        </div>
      )}
      {hintText && (
        <p id={`${id}-hint`} className={helpCls} aria-live={meter ? 'polite' : undefined}>
          {hintText}
        </p>
      )}
      <p id={`${id}-status`} className="m-0 flex items-center gap-1.5 text-sm font-semibold text-ok empty:hidden" aria-live="polite">
        {status ?? null}
      </p>
      <p id={`${id}-error`} className={fieldErrorCls} aria-live="polite">
        {error ?? ''}
      </p>
    </div>
  );
});
