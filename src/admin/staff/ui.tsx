/**
 * Tailwind building blocks of the staff screens (v0.8.0): page title, buttons,
 * fields, a modal sheet / side drawer, responsive tables, empty / loading /
 * error states. Strict token theme only (src/styles/tailwind.css); the
 * tokens are set on `.admin-root`, so overlays portal there. ≥44px targets,
 * ≥14px table text, focus trapped in dialogs and returned to the opener.
 */
import { useEffect, useId, useRef, type ReactNode, type TdHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../lib/hooks';
import { useT } from '../i18n';
import { Icon } from '../lib/icons';
import { errorText } from '../shell/ui';

export const cx = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'border-transparent bg-accent text-on shadow-panel hover:opacity-90',
  secondary: 'border-line bg-chip text-ink hover:border-accent',
  ghost: 'border-transparent bg-transparent text-accent hover:bg-soft',
  danger: 'border-bad bg-transparent text-bad hover:bg-soft',
};

/** 44px pill button / link. */
export const btn = (variant: Variant = 'secondary', extra?: string): string =>
  cx(
    'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-pill border px-5 text-base font-semibold whitespace-nowrap no-underline transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANT[variant],
    extra,
  );

export const iconBtn = (extra?: string): string =>
  cx('inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-pill border border-transparent bg-transparent text-muted transition-colors hover:bg-soft hover:text-ink', extra);

export const inputCls =
  'block w-full min-h-11 rounded-md border border-line bg-chip px-4 text-base text-ink transition-colors hover:border-accent aria-[invalid=true]:border-bad [&_option]:bg-g3';

export const cardCls = 'min-w-0 rounded-xl border border-edge bg-panel p-5 shadow-panel md:p-6';

/** The section's title (one h1 per view) + document.title, a description and the view's one primary action. */
export function PageTitle({ title, description, icon, action }: { title: string; description?: ReactNode; icon?: string; action?: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — ${t('app.title')}`;
    return () => {
      document.title = prev;
    };
  }, [title, t]);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid min-w-0 gap-1">
        <h1 className="flex items-center gap-3 text-ink">
          {icon && (
            <span className="inline-flex size-11 flex-none items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
              <Icon id={icon} size={22} />
            </span>
          )}
          <span className="min-w-0">{title}</span>
        </h1>
        {description && <p className="max-w-[70ch] text-base text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-3">{action}</div>}
    </header>
  );
}

export function Card({ children, className, title, titleId }: { children: ReactNode; className?: string; title?: ReactNode; titleId?: string }) {
  return (
    <section className={cx(cardCls, className)} aria-labelledby={titleId}>
      {title && (
        <h2 id={titleId} className="text-ink">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cx('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </span>
      )}
      <span id={`${id}-error`} className="text-sm font-semibold text-bad empty:hidden" role="alert">
        {error ?? ''}
      </span>
    </div>
  );
}

export const described = (id: string, hint?: boolean): string => (hint ? `${id}-hint ${id}-error` : `${id}-error`);

/** The staff member's 6-digit authenticator code. */
export function TotpField({ value, onChange, error, label }: { value: string; onChange(v: string): void; error?: string | null; label?: string }) {
  const t = useT();
  const id = useId();
  return (
    <Field id={id} label={label ?? t('staffui.totp')} hint={t('staffui.totpHint')} error={error}>
      <input
        id={id}
        className={cx(inputCls, 'max-w-48 font-mono text-lg tracking-[0.3em]')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        aria-invalid={!!error}
        aria-describedby={described(id, true)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </Field>
  );
}

/** A required «why» with a minimum length and a counter. */
export function ReasonField({ value, onChange, min, error, label, hint }: { value: string; onChange(v: string): void; min: number; error?: string | null; label?: string; hint?: string }) {
  const t = useT();
  const id = useId();
  const n = value.trim().length;
  return (
    <Field id={id} label={label ?? t('staffui.reason')} hint={hint ?? t('staffui.reasonHint', { min, n })} error={error}>
      <textarea
        id={id}
        rows={3}
        className={cx(inputCls, 'min-h-24 py-3')}
        value={value}
        aria-invalid={!!error}
        aria-describedby={described(id, true)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const t = useT();
  return (
    <div className="grid gap-3" role="status" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="block h-14 rounded-lg bg-soft" aria-hidden="true" />
      ))}
    </div>
  );
}

export function Empty({ icon = 'a-empty', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
        <Icon id={icon} size={26} />
      </span>
      <p className="text-md font-semibold text-ink">{title}</p>
      {text && <p className="max-w-[52ch] text-base text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorLine({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (!error) return null;
  const e = errorText(t, error);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad px-4 py-3" role="alert">
      <Icon id="warn" size={18} className="text-bad" />
      <span className="min-w-0 flex-1 text-base font-semibold text-ink">
        {e.title}
        {e.detail && <span className="font-normal text-muted"> — {e.detail}</span>}
      </span>
      {onRetry && (
        <button type="button" className={btn('secondary')} onClick={onRetry}>
          <Icon id="reset" size={18} />
          {t('staffui.retry')}
        </button>
      )}
    </div>
  );
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent';
export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-sm font-semibold',
        tone === 'ok' && 'border-ok text-ok',
        tone === 'bad' && 'border-bad text-bad',
        tone === 'warn' && 'border-gold bg-soft text-ink',
        tone === 'accent' && 'border-accent text-accent',
        tone === 'neutral' && 'border-line bg-chip text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Warning / info strip. */
export function Notice({ tone = 'warn', children, icon }: { tone?: 'warn' | 'info' | 'ok'; children: ReactNode; icon?: string }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-lg border px-4 py-3 text-base text-ink', tone === 'warn' ? 'border-gold bg-soft' : tone === 'ok' ? 'border-ok' : 'border-line bg-chip')} role={tone === 'warn' ? 'alert' : 'status'}>
      <Icon id={icon ?? (tone === 'ok' ? 'check' : tone === 'warn' ? 'warn' : 'info')} size={20} className={tone === 'ok' ? 'text-ok' : 'text-accent'} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Modal: a bottom sheet on phones, a centred dialog from 720px, or (`side`) a
 * drawer from the right. Esc and the backdrop close it; focus is trapped and
 * returns to the opener.
 */
export function Sheet({ title, onClose, children, footer, side, wide }: { title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode; side?: boolean; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useFocusTrap(ref, true);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const host = (typeof document !== 'undefined' && document.querySelector('.admin-root')) || document.body;
  return createPortal(
    <div className={cx('fixed inset-0 z-50 flex', side ? 'justify-end' : 'items-end justify-center md:items-center md:p-6')}>
      <div className="absolute inset-0 bg-ink opacity-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex w-full flex-col border border-edge bg-g3 shadow-panel',
          side ? 'h-full max-w-160 overflow-hidden' : cx('max-h-[92vh] rounded-t-xl md:rounded-xl', wide ? 'md:max-w-180' : 'md:max-w-140'),
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
          <h2 id={titleId} className="m-0 text-ink">
            {title}
          </h2>
          <button type="button" className={iconBtn('-mr-2 -mt-1')} aria-label={t('common.close')} onClick={onClose}>
            <Icon id="x" />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4 md:px-6">{footer}</div>}
      </div>
    </div>,
    host,
  );
}

/**
 * Responsive table: a real table from 720px; below it each row becomes a card
 * whose cells carry their column name (`data-label`). Text ≥14px.
 */
export const tableCls = 'w-full border-collapse text-base text-ink max-md:block';
export const theadCls = 'max-md:sr-only';
export const thCls = 'border-b border-line px-3 py-3 text-left text-sm font-semibold text-muted whitespace-nowrap';
export const trCls = 'border-b border-line max-md:mb-3 max-md:grid max-md:gap-1 max-md:rounded-lg max-md:border max-md:bg-panel max-md:p-3';
export const tbodyCls = 'max-md:block';

export function Td({ label, className, children, ...rest }: { label: string; className?: string; children?: ReactNode } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      data-label={label}
      className={cx(
        'px-3 py-3 align-middle max-md:flex max-md:min-h-0 max-md:items-baseline max-md:gap-3 max-md:p-1',
        'max-md:before:w-32 max-md:before:flex-none max-md:before:text-sm max-md:before:font-semibold max-md:before:text-muted max-md:before:content-[attr(data-label)]',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export const fmtDateTime = (iso: string | null | undefined, lang: string) =>
  iso ? new Intl.DateTimeFormat(lang === 'ky' ? 'ky-KG' : 'ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Cursor pager: a trail of cursors, back / forward. */
export function Pager({ trail, next, onBack, onNext }: { trail: string[]; next: string | null | undefined; onBack(): void; onNext(cursor: string): void }) {
  const t = useT();
  if (!trail.length && !next) return null;
  return (
    <nav className="flex flex-wrap gap-3" aria-label={t('staffui.pages')}>
      <button type="button" className={btn('secondary')} disabled={!trail.length} onClick={onBack}>
        <Icon id="prev" size={18} />
        {t('staffui.prev')}
      </button>
      <button type="button" className={btn('secondary')} disabled={!next} onClick={() => next && onNext(next)}>
        {t('staffui.next')}
        <Icon id="next" size={18} />
      </button>
    </nav>
  );
}
