/** Small shared UI primitives (scoped under `.admin-root` styles). */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Permission } from '@bilig/permissions';
import type { EndpointName } from '@bilig/content-model/api';
import { ApiError, ContractError } from '../api/client';
import { useCanCall, usePermissions } from '../api/hooks';
import { useT } from '../i18n';
import { Icon } from '../lib/icons';

export function errorText(t: ReturnType<typeof useT>, error: unknown): { title: string; detail?: string } {
  if (error instanceof ApiError) {
    return { title: t(`errors.${error.code}`, { defaultValue: t('errors.internal') }), detail: error.detail };
  }
  if (error instanceof ContractError) return { title: t('errors.contract'), detail: `${error.endpoint} (${error.where})` };
  return { title: t('errors.internal'), detail: error instanceof Error ? error.message : undefined };
}

export function ErrorBox({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  const e = errorText(t, error);
  const issues = error instanceof ApiError ? error.problem?.issues : error instanceof ContractError ? error.issues : undefined;
  return (
    <div className="adm-alert adm-alert--error" role="alert">
      <Icon id="warn" size={18} />
      <strong>{e.title}</strong>
      {e.detail && <span className="adm-muted"> — {e.detail}</span>}
      {issues && issues.length > 0 && (
        <ul>
          {issues.slice(0, 10).map((i, n) => (
            <li key={n}>
              <code>{i.path.join('.') || '—'}</code> {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Render children only when the user has the permission (presentation only). */
export function Can({ perm, endpoint, children }: { perm?: Permission; endpoint?: EndpointName; children: ReactNode }) {
  const can = usePermissions();
  const callable = useCanCall(endpoint ?? 'me');
  if (perm && !can(perm)) return null;
  if (endpoint && !callable) return null;
  return <>{children}</>;
}

export function PageHeader({ title, description, icon, children }: { title: ReactNode; description?: ReactNode; icon?: string; children?: ReactNode }) {
  return (
    <header className="adm-page-header">
      <div className="adm-page-header__text">
        <h1>
          {icon && (
            <span className="adm-page-header__icon">
              <Icon id={icon} size={22} />
            </span>
          )}
          <span>{title}</span>
        </h1>
        {description && <p className="adm-page-header__desc">{description}</p>}
      </div>
      {children && <div className="adm-toolbar">{children}</div>}
    </header>
  );
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'info' | 'archived';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`adm-badge adm-badge--${tone}`}>
      <i className="adm-badge__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Empty list / panel: an icon, what is missing and what to do next. */
export function EmptyState({ title, hint, icon = 'a-empty', children }: { title: ReactNode; hint?: ReactNode; icon?: string; children?: ReactNode }) {
  return (
    <div className="adm-empty">
      <span className="adm-empty__icon">
        <Icon id={icon} size={26} />
      </span>
      <b>{title}</b>
      {hint && <p className="adm-muted">{hint}</p>}
      {children}
    </div>
  );
}

/** Shimmering placeholder lines while data loads (announced once for screen readers). */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const t = useT();
  return (
    <div className="adm-skeleton" aria-busy="true">
      <span className="adm-sr">{t('common.loading')}</span>
      {Array.from({ length: lines }, (_, i) => (
        <i key={i} style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/** Horizontal scroll container for wide tables (the page itself never scrolls sideways). */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="adm-tablewrap">{children}</div>;
}

const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  review: 'warn',
  published: 'ok',
  archived: 'archived',
  ready: 'ok',
  failed: 'error',
  processing: 'warn',
  queued: 'neutral',
  building: 'warn',
  uploaded: 'neutral',
  active: 'ok',
  blocked: 'error',
  invited: 'warn',
  suspended: 'error',
  machine: 'warn',
  reviewed: 'ok',
  live: 'ok',
  soon: 'neutral',
  pending: 'warn',
  accepted: 'ok',
  revoked: 'archived',
  expired: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{t(`enum.${status}`, { defaultValue: status })}</Badge>;
}

export interface TabDef {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs({ tabs, value, onChange }: { tabs: TabDef[]; value: string; onChange(id: string): void }) {
  const id = useId();
  const active = tabs.find((x) => x.id === value) ?? tabs[0];
  return (
    <div className="adm-tabs">
      <div role="tablist" className="adm-tabs__list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${id}-${tab.id}`}
            aria-selected={tab.id === active.id}
            aria-controls={`${id}-${tab.id}-panel`}
            className={tab.id === active.id ? 'is-active' : undefined}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-${active.id}-panel`} aria-labelledby={`${id}-${active.id}`} className="adm-tabs__panel">
        {active.content}
      </div>
    </div>
  );
}

export function Dialog({ title, children, onClose, actions }: { title: ReactNode; children: ReactNode; onClose(): void; actions?: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Portal to the admin root: glass ancestors (backdrop-filter) would trap a fixed overlay.
  const host = typeof document !== 'undefined' ? document.querySelector('.admin-root') : null;
  const node = (
    <div className="adm-dialog-backdrop">
      <div className="adm-dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <div className="adm-dialog__head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="adm-ibtn" aria-label={t('common.close')} onClick={onClose}>
            <Icon id="x" />
          </button>
        </div>
        <div className="adm-dialog__body">{children}</div>
        {actions && <div className="adm-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}

/** Text filter bound to a URL param, applied on Enter/blur (no request per keystroke). */
export function FilterText({ label, value, onApply }: { label: string; value?: string; onApply(v: string | undefined): void }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return (
    <label className="adm-filter adm-filter--search">
      <span>{label}</span>
      <span className="adm-searchbox">
        <Icon id="search" size={18} />
        <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onApply(v.trim() || undefined)}
        onBlur={() => (v.trim() || undefined) !== value && onApply(v.trim() || undefined)}
        />
      </span>
    </label>
  );
}

export function FilterSelect({ label, value, options, onApply }: { label: string; value?: string; options: { value: string; label: ReactNode }[]; onApply(v: string | undefined): void }) {
  const t = useT();
  return (
    <label className="adm-filter">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onApply(e.target.value || undefined)}>
        <option value="">{t('list.any')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterCheck({ label, value, onApply }: { label: string; value?: string; onApply(v: string | undefined): void }) {
  return (
    <label className="adm-filter adm-filter--check">
      <input type="checkbox" className="adm-switch" checked={value === 'true'} onChange={(e) => onApply(e.target.checked ? 'true' : undefined)} />
      <span>{label}</span>
    </label>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const fmtDate = (iso: string | undefined, lang: string) => (iso ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
export const fmtNum = (n: number | null | undefined, lang: string, opts?: Intl.NumberFormatOptions) => (n === null || n === undefined ? '—' : new Intl.NumberFormat(lang, opts).format(n));

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
