/** The v0.8.0 mock API (MSW): staff sign-in with the fixed 2FA code, permissions, support sessions. */
import { describe, expect, it } from 'vitest';
import { API_PREFIX, HEADERS } from '@bilig/content-model/api';
import { TEACHER_ID } from './db';
import { CONTENT_MANAGER_EMAIL, MANAGER_EMAIL, STAFF_PASSWORD, STAFF_TOTP, SUPER_EMAIL } from './staff';

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(`${location.origin}${API_PREFIX}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', [HEADERS.audience]: 'admin', ...(token ? { [HEADERS.authorization]: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> };
};

async function signIn(email: string) {
  const first = await call('POST', '/auth/login', { email, password: STAFF_PASSWORD });
  expect(first.json.code).toBe('totp_required');
  expect((await call('POST', '/auth/login', { email, password: STAFF_PASSWORD, totp: '111111' })).status).toBe(401);
  const ok = await call('POST', '/auth/login', { email, password: STAFF_PASSWORD, totp: STAFF_TOTP });
  expect(ok.status).toBe(200);
  return ok.json.accessToken as string;
}

describe('mock staff API', () => {
  it('SuperAdmin: 2 SuperAdmins + managers, all journal groups, an alert, deletion requests', async () => {
    const tok = await signIn(SUPER_EMAIL);
    const staff = (await call('GET', '/admin/staff', undefined, tok)).json.items as { role: string; permissions: string[] }[];
    expect(staff.filter((m) => m.role === 'superadmin')).toHaveLength(2);
    const managers = staff.filter((m) => m.role === 'manager');
    expect(new Set(managers.map((m) => m.permissions.join()))).toHaveProperty('size', managers.length);
    const groups = new Set(((await call('GET', '/admin/journal?limit=200', undefined, tok)).json.items as { group: string }[]).map((e) => e.group));
    expect([...groups].sort()).toEqual(['auth', 'content', 'deletion', 'export', 'staff', 'support', 'teacher_data']);
    expect(((await call('GET', '/admin/journal/alerts', undefined, tok)).json.items as unknown[]).length).toBeGreaterThan(0);
    expect(((await call('GET', '/admin/deletion-requests?status=pending', undefined, tok)).json.items as unknown[]).length).toBeGreaterThan(0);
    const incomplete = (await call('GET', '/admin/teachers?profileStatus=incomplete', undefined, tok)).json.items as unknown[];
    expect(incomplete.length).toBeGreaterThan(0);
  });

  it('a content manager cannot see teachers; a support manager opens a view session that is read-only', async () => {
    const cm = await signIn(CONTENT_MANAGER_EMAIL);
    expect((await call('GET', '/admin/teachers', undefined, cm)).status).toBe(403);

    const m = await signIn(MANAGER_EMAIL);
    expect((await call('POST', `/admin/teachers/${TEACHER_ID}/support`, { mode: 'edit', reason: 'коротко' }, m)).status).toBe(400);
    const start = await call('POST', `/admin/teachers/${TEACHER_ID}/support`, { mode: 'view' }, m);
    expect(start.status).toBe(200);
    const support = start.json.accessToken as string;
    const me = (await call('GET', '/me', undefined, support)).json;
    expect(me.id).toBe(TEACHER_ID);
    expect((me.support as { mode: string }).mode).toBe('view');
    const write = await call('PATCH', '/me', { displayName: 'x' }, support);
    expect([write.status, write.json.detail]).toEqual([403, 'support_read_only']);
    const twoFa = await call('POST', '/me/2fa', { action: 'setup' }, support);
    expect([twoFa.status, twoFa.json.detail]).toEqual([403, 'support_forbidden']);
    const sessionId = (start.json.session as { id: string }).id;
    expect((await call('POST', `/admin/support/${sessionId}/end`, {}, m)).status).toBe(200);
    expect((await call('GET', '/me', undefined, support)).status).toBe(401);
  });
});
