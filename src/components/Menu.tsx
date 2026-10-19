/**
 * Header drop-down menus (profile, language, presentation): a button with
 * `aria-haspopup="menu"` + `aria-expanded` and a `role="menu"` popup. Opening
 * moves focus to the first item; ↑ / ↓ / Home / End move between items, Esc
 * closes and returns focus to the button, Tab or a click outside closes.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

const ITEMS = '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled), [role="menuitemradio"], [role="menuitemcheckbox"]';

export function useMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // The first item — or, in a pure choice list (languages), the current choice.
    const first = menuRef.current?.querySelector<HTMLElement>(ITEMS);
    const checked = first?.getAttribute('role') === 'menuitemradio' ? menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') : null;
    (checked ?? first)?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const move = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') setOpen(false);
    else if (!items.length) return;
    else if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(-1);
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  return {
    open,
    setOpen,
    close,
    rootRef,
    buttonProps: {
      ref: buttonRef,
      'aria-haspopup': 'menu' as const,
      'aria-expanded': open,
      onClick: () => setOpen((v) => !v),
      onKeyDown: onButtonKeyDown,
    },
    menuProps: { ref: menuRef, role: 'menu', onKeyDown: onMenuKeyDown },
  };
}

/** A labelled group inside a menu (e.g. «Тил» with the three languages). */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="menu__group" role="group" aria-label={label}>
      <div className="menu__label" aria-hidden="true">
        {label}
      </div>
      {children}
    </div>
  );
}
