import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, ContractError } from './client';
import { api, resetSession, useSession } from './session';
import { fail, mockApi, page } from '../test/utils';

beforeEach(() => {
  resetSession();
  useSession.setState({ token: 'tok', status: 'authenticated' });
});

describe('typed admin API client', () => {
  it('always sends the admin audience, the bearer token and the admin language', async () => {
    const m = mockApi({ 'GET /admin/topics': { body: page([]) } });
    await api.call('adminTopicList', { query: { status: 'draft', limit: 10 } });
    const c = m.calls[0];
    expect(c.headers['x-bilig-audience']).toBe('admin');
    expect(c.headers.authorization).toBe('Bearer tok');
    expect(c.headers['accept-language']).toMatch(/^(ru|ky)$/);
    expect(c.query.get('status')).toBe('draft');
  });

  it('If-Match is required for versioned writes and sent quoted', async () => {
    const m = mockApi({ 'DELETE /admin/concepts/:key': { body: { ok: true } } });
    await expect(api.call('adminConceptDelete', { params: { key: 'bio.x' } })).rejects.toThrow(/ifMatch/);
    await api.call('adminConceptDelete', { params: { key: 'bio.x' }, ifMatch: 7 });
    expect(m.calls[0].headers['if-match']).toBe('"7"');
  });

  it('optional If-Match (schools, licences) is sent only when a version is given', async () => {
    const school = { id: '00000000-0000-4000-8000-000000000003', name: 'S', region: 'R', type: 'state', language: 'ky', status: 'active', version: 3 };
    const m = mockApi({ 'PATCH /admin/schools/:id': { body: school } });
    await api.call('adminSchoolPatch', { params: { id: school.id }, body: { name: 'S' } });
    await api.call('adminSchoolPatch', { params: { id: school.id }, body: { name: 'S' }, ifMatch: 2 });
    expect(m.calls[0].headers['if-match']).toBeUndefined();
    expect(m.calls[1].headers['if-match']).toBe('"2"');
  });

  it('validates bodies before sending and responses after receiving', async () => {
    const m = mockApi({ 'GET /admin/topics': { body: { items: [{ nope: true }], nextCursor: null } } });
    await expect(api.call('adminGlossaryCreate', { body: { id: '', ky: '', ru: '', en: '', forbidden: [] } })).rejects.toBeInstanceOf(ContractError);
    expect(m.calls).toHaveLength(0);
    await expect(api.call('adminTopicList', {})).rejects.toMatchObject({ where: 'response' });
  });

  it('turns problem+json into ApiError with the code', async () => {
    mockApi({ 'DELETE /admin/concepts/:key': fail('in_use', { detail: 'topic:cell' }) });
    const e = await api.call('adminConceptDelete', { params: { key: 'bio.x' }, ifMatch: 1 }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('in_use');
    expect(e.status).toBe(409);
    expect(e.detail).toBe('topic:cell');
  });

  it('a failed refresh signs the session out', async () => {
    mockApi({ 'GET /me': fail('unauthorized'), 'POST /auth/refresh': fail('unauthorized') });
    await expect(api.call('me')).rejects.toBeInstanceOf(ApiError);
    expect(useSession.getState().token).toBeNull();
    expect(useSession.getState().status).toBe('anonymous');
  });

  it('downloads binary exports with the server filename', async () => {
    mockApi({ 'GET /admin/strings/export': { body: 'key,source,target', headers: { 'Content-Disposition': 'attachment; filename="bilig-ky-2026-10-15.csv"' } } });
    const r = await api.callBinary('adminStringsExport', { query: { format: 'csv', locale: 'ky' } });
    expect(r.filename).toBe('bilig-ky-2026-10-15.csv');
    expect(await r.blob.text()).toContain('key,source,target');
  });
});
