/**
 * v0.8.0 support session state (client side). A staff member opens a
 * teacher's cabinet from the admin: the admin calls `enterSupport` with the
 * POST /admin/teachers/:id/support answer, the SAME tab switches to
 * `/:lang/teacher`, and every client request carries the support token
 * (memory only). The staff member's admin session is untouched; `exitSupport`
 * ends the session on the server (through the admin client, registered as
 * `end`), restores the client's own session and goes back to the admin.
 */
import { create } from 'zustand';
import type { MeResponse, SupportSession } from '@bilig/content-model/api';
import type { Permission } from '@bilig/permissions';
import { api } from '../api/client';
import { useSession, type SessionStatus } from '../api/session';
import { toast } from '../state/ui';
import { supportAuth } from './token';

export interface ActiveSupport {
  session: SupportSession;
  /** Epoch ms when the server ends the session. */
  expiresAt: number;
  /** Where «Выйти в админку» goes (the teacher's page in the admin). */
  returnTo: string;
}

export type SupportExit = 'user' | 'expired' | 'revoked';

interface SupportState {
  active: ActiveSupport | null;
  /** The server said the session is gone (401 with the support token). */
  lost: boolean;
  /** Why the last session ended — the admin shows it once, then clears it. */
  notice: SupportExit | null;
  clearNotice(): void;
}

export const useSupport = create<SupportState>((set) => ({
  active: null,
  lost: false,
  notice: null,
  clearNotice: () => set({ notice: null }),
}));

/** Something with `clear()` — the host app's query cache (teacher data must not outlive the session). */
export interface Clearable {
  clear(): void;
}

const STORAGE_KEYS = ['bilig.lastSession', 'bilig.hasSession'];
let endRemote: (() => Promise<unknown>) | null = null;
let cache: Clearable | null = null;
let snapshot: { status: SessionStatus; me: MeResponse | null; permissions: Permission[]; storage: (string | null)[] } | null = null;

const readStorage = () =>
  STORAGE_KEYS.map((k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  });

function restoreStorage(values: (string | null)[]) {
  STORAGE_KEYS.forEach((k, i) => {
    try {
      const v = values[i];
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  });
}

function restoreClient() {
  supportAuth.set(null);
  cache?.clear();
  if (snapshot) {
    const { storage, ...session } = snapshot;
    useSession.setState(session);
    restoreStorage(storage);
  }
  snapshot = null;
}

export interface EnterSupport {
  session: SupportSession;
  accessToken: string;
  expiresIn: number;
  returnTo: string;
  /** Ends the session on the server (the admin's POST /admin/support/:id/end). */
  end: () => Promise<unknown>;
  cache?: Clearable | null;
}

/** Switch the client into the teacher's cabinet. Resolves once the teacher's profile is loaded. */
export async function enterSupport(o: EnterSupport): Promise<void> {
  if (useSupport.getState().active) await exitSupport('user');
  const s = useSession.getState();
  snapshot = { status: s.status, me: s.me, permissions: s.permissions, storage: readStorage() };
  cache = o.cache ?? null;
  cache?.clear();
  endRemote = o.end;
  supportAuth.set(o.accessToken);
  try {
    const me = await api('me');
    // Straight into the store: the teacher's profile is never written to storage.
    useSession.setState({ status: 'authed', me, permissions: me.permissions });
  } catch (e) {
    endRemote = null;
    restoreClient();
    throw e;
  }
  const serverEnd = Date.parse(o.session.expiresAt);
  const expiresAt = Number.isFinite(serverEnd) ? Math.min(serverEnd, Date.now() + o.expiresIn * 1000) : Date.now() + o.expiresIn * 1000;
  useSupport.setState({ active: { session: o.session, expiresAt, returnTo: o.returnTo }, lost: false, notice: null });
}

/** End the session (server + client). Returns where to go next (the admin), or null when none was active. */
export async function exitSupport(why: SupportExit): Promise<string | null> {
  const active = useSupport.getState().active;
  if (!active) return null;
  useSupport.setState({ active: null, lost: false });
  const end = endRemote;
  endRemote = null;
  restoreClient();
  try {
    await end?.();
  } catch {
    /* already ended / expired on the server */
  }
  useSupport.setState({ notice: why });
  return active.returnTo;
}

supportAuth.onProblem((status, code, detail) => {
  const tag = detail ?? code;
  if (tag === 'support_read_only' || code === 'support_read_only') toast({ key: 'support.readOnly', kind: 'error' });
  else if (tag === 'support_forbidden' || code === 'support_forbidden') toast({ key: 'support.forbidden', kind: 'error' });
  else if (status === 401) useSupport.setState({ lost: true });
});
