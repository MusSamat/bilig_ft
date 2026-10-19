/**
 * Session (TZ §6): adult e-mail + password, student class code → name → PIN.
 * The access token stays in memory; on start the app silently exchanges the
 * refresh cookie. Offline, the last known profile is trusted for 7 days so
 * downloaded topics and the student's queue keep working.
 *
 * Permissions come from GET /me (`permissions`); the client ONLY hides buttons
 * with them — the backend enforces every check (TZ §2).
 */
import { create } from 'zustand';
import { GUEST, grantedPermissions, type Permission } from '@bilig/permissions';
import {
  MeResponseSchema,
  TokenResponseSchema,
  type ClassCodeResponse,
  type MePatchRequest,
  type MeResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@bilig/content-model/api';
import { OFFLINE_SESSION_TTL_MS } from '../config';
import { api, isApiError, rawCall } from './client';
import { tokens } from './tokens';

export type SessionStatus = 'loading' | 'guest' | 'authed' | 'offline';

interface SessionState {
  status: SessionStatus;
  me: MeResponse | null;
  permissions: Permission[];
}

const GUEST_PERMISSIONS = grantedPermissions(GUEST);
const LAST_KEY = 'bilig.lastSession';
/** Set on sign-in, cleared on sign-out: a guest never calls /auth/refresh (no 401 noise). */
const HINT_KEY = 'bilig.hasSession';
const hint = (on?: boolean): boolean => {
  try {
    if (on === true) localStorage.setItem(HINT_KEY, '1');
    else if (on === false) localStorage.removeItem(HINT_KEY);
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true;
  }
};

export const useSession = create<SessionState>(() => ({
  status: 'loading',
  me: null,
  permissions: GUEST_PERMISSIONS,
}));

/** Does the current user hold a permission? (UI hiding only.) */
export const usePermission = (p: Permission): boolean => useSession((s) => s.permissions.includes(p));

function remember(me: MeResponse | null): void {
  try {
    if (me) localStorage.setItem(LAST_KEY, JSON.stringify({ me, savedAt: Date.now() }));
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* storage blocked */
  }
}

function lastKnown(): MeResponse | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as { me: unknown; savedAt: number } | null;
    if (!raw || Date.now() - raw.savedAt > OFFLINE_SESSION_TTL_MS) return null;
    const parsed = MeResponseSchema.safeParse(raw.me);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const setAuthed = (me: MeResponse) => {
  remember(me);
  hint(true);
  useSession.setState({ status: 'authed', me, permissions: me.permissions });
};
const setGuest = () => {
  remember(null);
  hint(false);
  tokens.set(null);
  useSession.setState({ status: 'guest', me: null, permissions: GUEST_PERMISSIONS });
};

tokens.setRefresher(async () => {
  try {
    const res = await rawCall('refresh', { body: {}, noRefresh: true });
    const parsed = TokenResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch (e) {
    if (isApiError(e) && e.offline) throw e; // keep the current token while offline
    return null;
  }
});

export async function loadMe(): Promise<MeResponse | null> {
  try {
    const me = await api('me');
    setAuthed(me);
    return me;
  } catch (e) {
    if (isApiError(e) && e.offline) return offlineFallback();
    setGuest();
    return null;
  }
}

function offlineFallback(): MeResponse | null {
  const me = lastKnown();
  if (me) useSession.setState({ status: 'offline', me, permissions: me.permissions });
  else useSession.setState({ status: 'guest', me: null, permissions: GUEST_PERMISSIONS });
  return me;
}

/** App start: restore the session from the refresh cookie. */
export async function bootstrapSession(): Promise<void> {
  if (!hint()) {
    useSession.setState({ status: 'guest', me: null, permissions: GUEST_PERMISSIONS });
    return;
  }
  try {
    const ok = await tokens.refresh();
    if (ok) {
      await loadMe();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      offlineFallback();
      return;
    }
    setGuest();
  } catch {
    offlineFallback();
  }
}

export async function loginAdult(email: string, password: string, totp?: string): Promise<MeResponse | 'totp'> {
  const res = await api('login', { body: { email, password, ...(totp ? { totp } : {}) } });
  if (res.totpRequired) return 'totp';
  tokens.set(res.accessToken, res.expiresIn);
  const me = await loadMe();
  if (!me) throw new Error('session');
  return me;
}

/**
 * v0.6.0 teacher self-registration. Step 1 sends the e-mail code (the answer is the
 * same whether or not the address is taken); step 2 confirms it and signs in exactly
 * like `loginAdult` — the account cannot sign in before it is verified.
 */
export function registerTeacher(body: RegisterRequest): Promise<RegisterResponse> {
  return api('register', { body });
}

export function resendRegistrationCode(email: string): Promise<RegisterResponse> {
  return api('registerResend', { body: { email } });
}

export async function verifyRegistration(email: string, code: string): Promise<MeResponse> {
  const res = await api('registerVerify', { body: { email, code } });
  tokens.set(res.accessToken, res.expiresIn);
  const me = await loadMe();
  if (!me) throw new Error('session');
  return me;
}

/** PATCH /me and keep the session's profile (and permissions) in sync with the answer. */
export async function patchMe(body: MePatchRequest): Promise<MeResponse> {
  const me = await api('mePatch', { body });
  setAuthed(me);
  return me;
}

export function lookupClassCode(code: string): Promise<ClassCodeResponse> {
  return api('classCode', { body: { code } });
}

export async function loginStudent(classId: string, studentId: string, pin: string): Promise<MeResponse> {
  const res = await api('studentLogin', { body: { classId, studentId, pin } });
  tokens.set(res.accessToken, res.expiresIn);
  const me = await loadMe();
  if (!me) throw new Error('session');
  return me;
}

export async function logout(all = false): Promise<void> {
  try {
    await api(all ? 'logoutAll' : 'logout', { body: {} });
  } catch {
    /* already gone / offline — clear locally anyway */
  }
  setGuest();
}
