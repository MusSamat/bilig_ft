/**
 * Admin session state (Zustand): the access token is kept in memory only
 * (TZ §6); the refresh token is the HttpOnly `bilig_admin_rt` cookie the
 * browser sends on POST /auth/refresh. `me` carries the permission list the
 * UI uses to hide actions (TZ §2 «Фронтенд … только скрывает недоступные кнопки»).
 */
import { create } from 'zustand';
import type { MeResponse } from '@bilig/content-model/api';
import { useAdminLang } from '../i18n';
import { createApiClient } from './client';

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

interface SessionState {
  token: string | null;
  me: MeResponse | null;
  status: SessionStatus;
  setToken(token: string | null): void;
  setMe(me: MeResponse | null): void;
  signOut(): void;
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  me: null,
  status: 'unknown',
  setToken: (token) => set(token ? { token } : { token: null, me: null, status: 'anonymous' }),
  setMe: (me) => set({ me, status: me ? 'authenticated' : 'anonymous' }),
  signOut: () => set({ token: null, me: null, status: 'anonymous' }),
}));

/** The admin's API client singleton (state is read lazily, so tests can reset the store). */
export const api = createApiClient({
  getToken: () => useSession.getState().token,
  setToken: (t) => useSession.getState().setToken(t),
  lang: () => useAdminLang.getState().lang,
  onAuthLost: () => useSession.getState().signOut(),
});

/** Reset the session (tests). */
export function resetSession() {
  useSession.setState({ token: null, me: null, status: 'unknown' });
}
