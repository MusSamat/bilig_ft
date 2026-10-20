/**
 * Disclosure: a native <details> with a 44px summary row, a chevron and a
 * visible focus ring. Long sections fold on phones (`open="wide"`: open from
 * the md breakpoint up, closed below) and may remember their state per device
 * (`rememberKey`, localStorage behind try/catch).
 */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

const MD = '(min-width: 720px)';

function readStored(key: string | undefined): boolean | null {
  if (!key) return null;
  try {
    const v = localStorage.getItem(key);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

function initialOpen(open: boolean | 'wide', rememberKey?: string): boolean {
  const stored = readStored(rememberKey);
  if (stored !== null) return stored;
  if (open !== 'wide') return open;
  try {
    return window.matchMedia(MD).matches;
  } catch {
    return true;
  }
}

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  /** `true`, `false`, or `'wide'` (open at ≥ 720px, folded on phones). */
  open?: boolean | 'wide';
  /** localStorage key that remembers the reader's choice. */
  rememberKey?: string;
  className?: string;
  summaryClassName?: string;
  /** Extra attributes for the root (data-ask, aria-*). */
  rootProps?: Record<string, string | undefined>;
}

export function Disclosure({ summary, children, open = 'wide', rememberKey, className = '', summaryClassName = '', rootProps }: DisclosureProps): JSX.Element {
  const [isOpen, setOpen] = useState(() => initialOpen(open, rememberKey));
  return (
    <details
      className={`group/disc ${className}`}
      open={isOpen}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        if (next === isOpen) return;
        setOpen(next);
        if (rememberKey)
          try {
            localStorage.setItem(rememberKey, next ? '1' : '0');
          } catch {
            /* private mode: not remembered */
          }
      }}
      {...rootProps}
    >
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md font-semibold text-ink [&::-webkit-details-marker]:hidden focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent ${summaryClassName}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">{summary}</span>
        <Icon name="down" className="sm shrink-0 text-muted transition-transform group-open/disc:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
