/**
 * WhatsApp number field: a fixed «+996» prefix and the 9 national digits grouped
 * live as «555 12 34 56». Pasting or auto-filling a full number in any common
 * spelling («+996 555…», «0555…», «996555…») fills it. The caret keeps its place
 * among the digits while the spaces move.
 */
import { forwardRef, useLayoutEffect, useRef, type ClipboardEvent, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNational, nationalDigits } from './phone';
import { cx, fieldCls, fieldErrorCls, helpCls, labelCls } from './ui';

interface Props {
  id: string;
  label: string;
  /** National digits («555123456»). */
  value: string;
  onChange: (digits: string) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Index in `formatted` just after the n-th digit. */
function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === n) return i + 1;
  }
  return formatted.length;
}

export const PhoneField = forwardRef<HTMLInputElement, Props>(function PhoneField({ id, label, value, onChange, onBlur, hint, error, disabled, autoFocus }, ref) {
  const { t } = useTranslation();
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const formatted = formatNational(value);

  useLayoutEffect(() => {
    const el = inner.current;
    if (caret.current === null || !el || document.activeElement !== el) return;
    const pos = caretAfterDigits(formatted, caret.current);
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [formatted]);

  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.replace(/\D/g, '').length < 9) return; // a fragment: let it land at the caret
    e.preventDefault();
    const digits = nationalDigits(text);
    caret.current = digits.length;
    onChange(digits);
  };

  const describedBy = [`${id}-prefix`, hint ? `${id}-hint` : '', `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className={fieldCls}>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div
        className={cx(
          'flex min-h-12 min-w-0 items-stretch overflow-hidden rounded-pill border bg-chip transition-[border-color,box-shadow]',
          'focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_40%,transparent)]',
          error ? 'border-bad' : 'border-line hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]',
          disabled && 'opacity-60',
        )}
      >
        <span id={`${id}-prefix`} className="flex shrink-0 items-center border-r border-line bg-soft px-3 font-semibold tabular-nums text-ink">
          <span aria-hidden="true">+996</span>
          <span className="sr-only">{t('auth.phone.prefix')}</span>
        </span>
        <input
          ref={setRef}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="555 12 34 56"
          className="min-w-0 flex-1 border-0 bg-transparent px-3 text-md tracking-[0.04em] tabular-nums text-ink outline-none placeholder:text-muted placeholder:opacity-60"
          value={formatted}
          maxLength={16}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onPaste={onPaste}
          onBlur={onBlur}
          onChange={(e) => {
            const raw = e.target.value;
            const at = e.target.selectionStart ?? raw.length;
            const before = nationalDigits(raw.slice(0, at)).length;
            const digits = nationalDigits(raw);
            caret.current = Math.min(before, digits.length);
            onChange(digits);
          }}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className={helpCls}>
          {hint}
        </p>
      )}
      <p id={`${id}-error`} className={fieldErrorCls} aria-live="polite">
        {error?.trim() ?? ''}
      </p>
    </div>
  );
});
