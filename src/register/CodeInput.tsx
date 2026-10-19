/**
 * Six one-digit boxes for an e-mail code: typing moves forward, Backspace moves
 * back, arrows move, a paste (or SMS/e-mail autofill into any box) spreads the
 * digits. `onComplete` fires once when all six are filled. Numeric keyboard on
 * phones (`inputMode="numeric"`), `autocomplete="one-time-code"` on the first box.
 */
import { forwardRef, useImperativeHandle, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

export const CODE_LENGTH = 6;

export interface CodeInputHandle {
  focus: (index?: number) => void;
}

/** One entry per box ('' = empty). */
export type CodeDigits = string[];
export const emptyCode = (): CodeDigits => Array.from({ length: CODE_LENGTH }, () => '');

interface Props {
  value: CodeDigits;
  onChange: (v: CodeDigits) => void;
  onComplete: (code: string) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}

export const CodeInput = forwardRef<CodeInputHandle, Props>(function CodeInput({ value, onChange, onComplete, labelledBy, describedBy, invalid, disabled }, ref) {
  const { t } = useTranslation();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))]?.focus();
  useImperativeHandle(ref, () => ({ focus: (i = 0) => focus(i) }));

  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');

  /** Write `text` from box `at` on; returns the new value. */
  const put = (at: number, text: string) => {
    const incoming = text.replace(/\D/g, '');
    if (!incoming) return;
    const next = [...digits];
    // A full code pasted or auto-filled anywhere replaces the whole value.
    const start = incoming.length >= CODE_LENGTH ? 0 : at;
    for (let k = 0; k < incoming.length && start + k < CODE_LENGTH; k++) next[start + k] = incoming[k];
    onChange(next);
    const empty = next.findIndex((d) => !d);
    if (empty === -1) {
      focus(CODE_LENGTH - 1);
      onComplete(next.join(''));
    } else focus(Math.min(start + incoming.length, CODE_LENGTH - 1));
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = '';
      else if (i > 0) {
        next[i - 1] = '';
        focus(i - 1);
      }
      onChange(next);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    put(i, e.clipboardData.getData('text'));
  };

  return (
    <div className="otp" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          className="input otp__box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? CODE_LENGTH : 1}
          value={d}
          disabled={disabled}
          aria-label={t('register.code.digit', { n: i + 1, total: CODE_LENGTH })}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '');
            if (!typed) return;
            // Typing into a filled first box (it accepts autofill) appends: keep the new digit.
            put(i, d && typed.length === 2 ? typed[1] : typed);
          }}
        />
      ))}
    </div>
  );
});
