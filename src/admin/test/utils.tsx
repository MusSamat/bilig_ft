/** Test helpers: a fetch mock routed by `METHOD /path` (under /api/v1) and an admin renderer. */
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { PERMISSIONS } from '@bilig/permissions';
import { problem, type ErrorCode, type MeResponse } from '@bilig/content-model/api';
import AdminApp from '../index';
import { resetSession, useSession } from '../api/session';
import { registerAdminI18n, useAdminLang } from '../i18n';

// Self-cleaning, so the tests behave the same under bilig_ft's setup (MSW server, no storage reset).
afterEach(() => {
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* node environment */
  }
});

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
export type Handler = Reply | ((call: Call, params: Record<string, string>) => Reply | Promise<Reply>);

export const ok = (body: unknown): Reply => ({ status: 200, body });
export const fail = (code: ErrorCode, extra: Record<string, unknown> = {}): Reply => {
  const p = problem(code, extra);
  return { status: p.status, body: p };
};

/** Install a fetch mock. Routes: `{ 'GET /admin/subjects/:key': handler }`. Unmatched → 404 problem. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const table = Object.entries(routes).map(([k, h]) => {
    const [method, pattern] = k.split(' ');
    const names: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, n) => (names.push(n), '([^/]+)')) + '$');
    return { method, re, names, h };
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const call: Call = { method: init.method ?? 'GET', path, query: url.searchParams, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const r of table) {
      const m = r.re.exec(path);
      if (r.method !== call.method || !m) continue;
      const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      const rep = typeof r.h === 'function' ? await r.h(call, params) : r.h;
      return new Response(rep.body === undefined ? null : JSON.stringify(rep.body), { status: rep.status ?? 200, headers: { 'Content-Type': 'application/json', ...rep.headers } });
    }
    const p = problem('not_found', { detail: `${call.method} ${path}` });
    return new Response(JSON.stringify(p), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    find: (method: string, path: string | RegExp) => calls.filter((c) => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path))),
  };
}

export const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

export function meFixture(permissions: readonly string[] = PERMISSIONS): MeResponse {
  return {
    id: ADMIN_ID,
    kind: 'adult',
    displayName: 'Admin',
    email: 'admin@bilig.kg',
    locale: 'ru',
    grants: [{ role: 'superadmin', scope: 'platform' }],
    permissions: permissions as MeResponse['permissions'],
    totpEnabled: true,
  };
}

export function testI18n(): I18n {
  const i = i18next.createInstance();
  void i.use(initReactI18next).init({ lng: 'ru', fallbackLng: 'ru', resources: {}, interpolation: { escapeValue: false } });
  return registerAdminI18n(i);
}

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

export const currentUrl = () => new URL(screen.getByTestId('location').textContent ?? '/', 'http://localhost');

/** Render the admin at `path`. `me: null` → no session (login flow). */
export function renderAdmin(path: string, opts: { me?: MeResponse | null } = {}) {
  resetSession();
  useAdminLang.setState({ lang: 'ru' });
  const me = opts.me === undefined ? meFixture() : opts.me;
  if (me) useSession.setState({ token: 'test-token', me, status: 'authenticated' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp i18n={testI18n()} queryClient={qc} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

export const rec = <T,>(data: T, version = 1) => ({ id: '00000000-0000-4000-8000-0000000000aa', data, version, updatedAt: '2026-10-01T10:00:00.000Z' });
export const page = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });
export const L = (ru: string, ky = ru, en = ru) => ({ ky, ru, en });
