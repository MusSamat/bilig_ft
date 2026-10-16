/** Prototype-style toast (`#toast`): one ink pill at the bottom centre, i18n keys only. */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';
import { Icon } from '../lib/icons';

interface ToastMsg {
  id: number;
  key: string;
  params?: Record<string, unknown>;
  tone?: 'ok' | 'bad' | 'info';
}

interface ToastState {
  current: ToastMsg | null;
  push(key: string, opts?: { params?: Record<string, unknown>; tone?: ToastMsg['tone'] }): void;
  clear(): void;
}

let seq = 0;
export const useToast = create<ToastState>((set) => ({
  current: null,
  push: (key, opts) => set({ current: { id: ++seq, key, ...opts } }),
  clear: () => set({ current: null }),
}));

export const toast = (key: string, opts?: { params?: Record<string, unknown>; tone?: ToastMsg['tone'] }) => useToast.getState().push(key, opts);

export function Toaster() {
  const t = useT();
  const cur = useToast((s) => s.current);
  const clear = useToast((s) => s.clear);
  useEffect(() => {
    if (!cur) return;
    const h = setTimeout(clear, 3200);
    return () => clearTimeout(h);
  }, [cur, clear]);
  return (
    <div className={`adm-toast${cur ? ' is-on' : ''}`} role="status" aria-live="polite">
      {cur && (
        <>
          <Icon id={cur.tone === 'bad' ? 'warn' : cur.tone === 'info' ? 'info' : 'check'} size={18} />
          <span>{t(cur.key, cur.params)}</span>
        </>
      )}
    </div>
  );
}
