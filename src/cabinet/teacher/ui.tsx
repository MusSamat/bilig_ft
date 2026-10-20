/**
 * Small Tailwind building blocks of the teacher cabinet: buttons, cards, form
 * fields, a modal sheet, tabs, empty / error / loading states, copy button.
 * Every value comes from the design tokens (strict Tailwind theme): one type
 * scale, the 4px grid, ≥44px targets, the accent focus ring from base.css.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { useFocusTrap, useKeydown } from '../../lib/hooks';
import { toast } from '../../state/ui';

export const cx = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'border-transparent bg-accent text-on shadow-panel hover:opacity-90',
  secondary: 'border-line bg-chip text-ink hover:border-accent',
  ghost: 'border-transparent bg-transparent text-accent hover:bg-soft',
  danger: 'border-bad bg-transparent text-bad hover:bg-soft',
};

/** Button / link classes: 44px tall pill, icon + label. */
export const btn = (variant: Variant = 'secondary', extra?: string): string =>
  cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border px-5 text-base font-semibold no-underline transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANT[variant],
    extra,
  );

/** Square icon-only button (44×44). */
export const iconBtn = (extra?: string): string =>
  cx('inline-flex size-11 flex-none items-center justify-center rounded-pill border border-transparent bg-transparent text-muted transition-colors hover:bg-soft hover:text-ink disabled:opacity-50', extra);

export const inputCls =
  'block w-full min-h-11 rounded-md border border-line bg-chip px-4 text-base text-ink transition-colors hover:border-accent aria-[invalid=true]:border-bad [&_option]:bg-g3';

export const cardCls = 'min-w-0 rounded-xl border border-edge bg-panel p-5 shadow-panel [backdrop-filter:var(--blur)] md:p-6';

export function Card({ children, className, labelledBy, as: As = 'section' }: { children: ReactNode; className?: string; labelledBy?: string; as?: 'section' | 'div' }): JSX.Element {
  return (
    <As className={cx(cardCls, className)} aria-labelledby={labelledBy}>
      {children}
    </As>
  );
}

/** Section heading with an icon in a soft circle. */
export function CardTitle({ id, icon, children, level = 2 }: { id?: string; icon?: string; children: ReactNode; level?: 2 | 3 }): JSX.Element {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <H id={id} className={cx('flex items-center gap-3 font-serif font-bold text-ink', level === 2 ? 'text-xl' : 'text-lg')}>
      {icon && (
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
          <Icon name={icon} />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </H>
  );
}

/** Label above, control, then hint and error (linked with aria-describedby by the caller via ids). */
export function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }): JSX.Element {
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

/** Ids for `aria-describedby` of a Field's control. */
export const described = (id: string, hint?: boolean): string => (hint ? `${id}-hint ${id}-error` : `${id}-error`);

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <span className={cx('block rounded-lg bg-soft', className)} aria-hidden="true" />;
}

export function Loading({ rows = 2, className }: { rows?: number; className?: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={cx('grid gap-3', className)} aria-busy="true" aria-label={t('common.loading')} role="status">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }): JSX.Element {
  return (
    <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-line px-4 py-8 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
        <Icon name={icon} className="lg" />
      </span>
      <p className="text-md font-semibold text-ink">{title}</p>
      {text && <p className="max-w-[48ch] text-base text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad px-4 py-3" role="alert">
      <Icon name="warn" className="text-bad" />
      <span className="min-w-0 flex-1 font-semibold text-ink">{text}</span>
      {onRetry && (
        <button type="button" className={btn('secondary')} onClick={onRetry}>
          <Icon name="reset" className="sm" />
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** A quiet rounded label: trial days, code state, counts. */
export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn'; className?: string }): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex min-h-7 items-center gap-1.5 rounded-pill border px-3 text-sm font-semibold',
        tone === 'ok' ? 'border-ok text-ok' : tone === 'warn' ? 'border-bad text-bad' : 'border-line bg-chip text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies `value`, then says so in a toast. */
export function CopyButton({ value, label, className, withText }: { value: string; label: string; className?: string; withText?: boolean }): JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={withText ? btn('secondary', className) : iconBtn(className)}
      aria-label={label}
      title={label}
      onClick={async () => toast({ key: (await copyText(value)) ? 'teacher.copied' : 'teacher.copyFailed', params: { value }, kind: 'success' })}
    >
      <Icon name="copy" className="sm" />
      {withText && t('teacher.copy')}
    </button>
  );
}

/**
 * Modal sheet: a bottom sheet on phones, a centred dialog from 720px. Esc and
 * the backdrop close it; focus is trapped inside and returns to the opener.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, true);
  useKeydown((e) => e.key === 'Escape' && onClose(), { allowInInputs: true });
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea');
    (first ?? ref.current)?.focus();
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-ink opacity-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative grid max-h-[92vh] w-full gap-5 overflow-y-auto rounded-t-xl border border-edge bg-g3 p-5 shadow-panel md:max-w-130 md:rounded-xl md:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-xl font-bold text-ink">
            {title}
          </h2>
          <button type="button" className={iconBtn('-me-2 -mt-2')} onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: string;
}

/**
 * Tabs (WAI-ARIA): ←/→/Home/End move and select. `idBase` names the tab and
 * panel ids: `${idBase}-tab-${key}` / `${idBase}-panel`.
 */
export function Tabs<K extends string>({ items, value, onChange, label, idBase, className }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void; label: string; idBase: string; className?: string }): JSX.Element {
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((x) => x.key === value);
    const go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const next = items[(go + items.length) % items.length].key;
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`${idBase}-tab-${next}`)?.focus());
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cx('flex flex-wrap gap-1 rounded-xl border border-line bg-chip p-1 md:rounded-pill', className)}>
      {items.map((x) => {
        const on = x.key === value;
        return (
          <button
            key={x.key}
            type="button"
            role="tab"
            id={`${idBase}-tab-${x.key}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(x.key)}
            className={cx(
              'inline-flex min-h-11 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-pill border-0 px-4 text-base font-semibold transition-colors md:flex-none',
              on ? 'bg-accent text-on' : 'bg-transparent text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {x.icon && <Icon name={x.icon} className="sm" />}
            {x.label}
          </button>
        );
      })}
    </div>
  );
}
