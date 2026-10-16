/** A-15 / A-16 against contract 0.3.0: versioned schools and licences, invite revoke / resend, pupil reveal. */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@bilig/permissions';
import { fail, meFixture, mockApi, page, renderAdmin, currentUrl } from '../test/utils';
import { inviteStatus } from './Users';

configure({ asyncUtilTimeout: 5000 });

const SCHOOL_ID = '00000000-0000-4000-8000-000000000003';
const PUPIL_ID = '00000000-0000-4000-8000-000000000004';
const LICENSE_ID = '00000000-0000-4000-8000-000000000007';
const AUDIT_ID = '00000000-0000-4000-8000-000000000008';
const school = { id: SCHOOL_ID, name: 'Школа №1', region: 'Бишкек', type: 'state', language: 'ky', status: 'active', version: 3 };
const license = { id: LICENSE_ID, schoolId: SCHOOL_ID, subjects: ['biology'], grades: [7], seats: 30, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2027-06-01T00:00:00.000Z', version: 2 };
const future = '2099-01-01T00:00:00.000Z';
const invite = (id: string, extra: Record<string, unknown>) => ({ id: `00000000-0000-4000-8000-0000000001${id}`, email: `${id}@school.kg`, role: 'teacher', scope: 'school', expiresAt: future, ...extra });

describe('A-15 schools and licences (versioned)', () => {
  it('saves the school with If-Match; a 409 opens the conflict dialog and «keep mine» re-saves on their version', async () => {
    let stored = { ...school };
    const api = mockApi({
      'GET /admin/schools/:id': () => ({ body: stored }),
      'GET /admin/licenses': { body: page([license]) },
      'PATCH /admin/schools/:id': (c) => {
        if (c.headers['if-match'] !== `"${stored.version}"`) return fail('version_mismatch');
        stored = { ...stored, ...(c.body as object), version: stored.version + 1 };
        return { body: stored };
      },
    });
    renderAdmin(`/admin/schools/${SCHOOL_ID}`);
    const name = await screen.findByDisplayValue('Школа №1');
    // someone else saves meanwhile
    stored = { ...stored, region: 'Ош', version: 4 };
    fireEvent.change(name, { target: { value: 'Школа №1 им. Айтматова' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Запись изменилась' });
    expect(api.find('PATCH', `/admin/schools/${SCHOOL_ID}`)[0].headers['if-match']).toBe('"3"');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить мою поверх' }));
    await waitFor(() => expect(api.find('PATCH', `/admin/schools/${SCHOOL_ID}`)).toHaveLength(2));
    const second = api.find('PATCH', `/admin/schools/${SCHOOL_ID}`)[1];
    expect(second.headers['if-match']).toBe('"4"');
    expect(second.body).toMatchObject({ name: 'Школа №1 им. Айтматова' });
    expect(second.body).not.toHaveProperty('version');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/нет версии в API/)).toBeNull();
  });

  it('licence edit and delete send the licence version as If-Match', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = mockApi({
      'GET /admin/schools/:id': { body: school },
      'GET /admin/licenses': { body: page([license]) },
      'PATCH /admin/licenses/:id': (c) => ({ body: { ...license, ...(c.body as object), version: 3 } }),
      'DELETE /admin/licenses/:id': { body: { ok: true } },
    });
    renderAdmin(`/admin/schools/${SCHOOL_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByDisplayValue('30'), { target: { value: '45' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.find('PATCH', `/admin/licenses/${LICENSE_ID}`)).toHaveLength(1));
    const patch = api.find('PATCH', `/admin/licenses/${LICENSE_ID}`)[0];
    expect(patch.headers['if-match']).toBe('"2"');
    expect(patch.body).toMatchObject({ seats: 45 });
    expect(patch.body).not.toHaveProperty('id');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(api.find('DELETE', `/admin/licenses/${LICENSE_ID}`)).toHaveLength(1));
    expect(api.find('DELETE', `/admin/licenses/${LICENSE_ID}`)[0].headers['if-match']).toBe('"2"');
  });

  it('school list filters go to the server and into the URL', async () => {
    const api = mockApi({ 'GET /admin/schools': { body: page([school]) } });
    renderAdmin('/admin/schools');
    await screen.findByText('Школа №1');
    const search = screen.getByLabelText('Поиск');
    fireEvent.change(search, { target: { value: 'Айтматов' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.submit(search);
    await waitFor(() => expect(api.find('GET', '/admin/schools').some((c) => c.query.get('q') === 'Айтматов')).toBe(true));
    expect(currentUrl().searchParams.get('q')).toBe('Айтматов');
  });
});

describe('A-16 invitations', () => {
  it('derives the status for pre-0.3.0 rows', () => {
    const base = { id: 'x', email: 'a@b.kg', role: 'teacher', scope: 'school', expiresAt: future } as const;
    expect(inviteStatus({ ...base, status: 'revoked' })).toBe('revoked');
    expect(inviteStatus({ ...base, acceptedAt: future })).toBe('accepted');
    expect(inviteStatus({ ...base, revokedAt: future })).toBe('revoked');
    expect(inviteStatus({ ...base, expiresAt: '2020-01-01T00:00:00.000Z' })).toBe('expired');
    expect(inviteStatus(base)).toBe('pending');
  });

  it('shows statuses, revokes and resends; accepted invites have no actions', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const rows = [invite('01', { status: 'pending' }), invite('02', { status: 'accepted', acceptedAt: future }), invite('03', { status: 'expired' })];
    const api = mockApi({
      'GET /admin/users': { body: page([]) },
      'GET /admin/schools': { body: page([]) },
      'GET /admin/invites': { body: page(rows) },
      'DELETE /admin/invites/:id': { body: { ok: true } },
      'POST /admin/invites/:id/resend': (_c, p) => ({ body: { ...rows[2], id: p.id, status: 'pending' } }),
    });
    renderAdmin('/admin/users');
    fireEvent.click(await screen.findByRole('tab', { name: 'Приглашения' }));
    const pendingRow = (await screen.findByText('01@school.kg')).closest('tr')!;
    expect(within(pendingRow).getByText('Ожидает')).toBeInTheDocument();
    const acceptedRow = screen.getByText('02@school.kg').closest('tr')!;
    expect(within(acceptedRow).queryByRole('button')).toBeNull();

    fireEvent.click(within(pendingRow).getByRole('button', { name: 'Отозвать' }));
    expect(await screen.findByText('Приглашение отозвано')).toBeInTheDocument();
    expect(api.find('DELETE', `/admin/invites/${rows[0].id}`)).toHaveLength(1);

    const expiredRow = screen.getByText('03@school.kg').closest('tr')!;
    fireEvent.click(within(expiredRow).getByRole('button', { name: 'Отправить снова' }));
    expect(await screen.findByText(/Новое приглашение отправлено на 03@school.kg/)).toBeInTheDocument();
    expect(api.find('POST', `/admin/invites/${rows[2].id}/resend`)[0].body).toEqual({});
  });

  it('a 409 on revoke (accepted meanwhile) shows the problem', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /admin/users': { body: page([]) },
      'GET /admin/schools': { body: page([]) },
      'GET /admin/invites': { body: page([invite('01', { status: 'pending' })]) },
      'DELETE /admin/invites/:id': fail('conflict', { detail: 'invite_accepted' }),
    });
    renderAdmin('/admin/users');
    fireEvent.click(await screen.findByRole('tab', { name: 'Приглашения' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Отозвать' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('A-16 pupil reveal «с основанием»', () => {
  const pupil = { id: PUPIL_ID, kind: 'student', displayName: 'Ученик 7Б-12', status: 'active', grants: [] };
  const reveal = {
    userId: PUPIL_ID,
    displayName: 'Асель Токтогулова',
    classes: [{ classId: '00000000-0000-4000-8000-000000000009', className: '7Б', schoolId: SCHOOL_ID, schoolName: 'Школа №1' }],
    revealedAt: '2026-10-16T09:00:00.000Z',
    auditId: AUDIT_ID,
  };

  it('requires a ground and a reason, shows the result once, and keeps nothing after closing', async () => {
    const api = mockApi({ 'GET /admin/users/:id': { body: pupil }, 'POST /admin/users/:id/reveal': { body: reveal } });
    renderAdmin(`/admin/users/${PUPIL_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Раскрыть данные (с основанием)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Раскрытие данных ученика' });
    const submit = within(dialog).getByRole('button', { name: 'Раскрыть' });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Основание'), { target: { value: 'parent_request' } });
    fireEvent.change(within(dialog).getByLabelText('Причина'), { target: { value: 'коротко' } });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Причина'), { target: { value: 'Письмо родителя о переводе в другую школу' } });
    fireEvent.change(within(dialog).getByLabelText('Номер письма или обращения'), { target: { value: 'ВХ-2026/118' } });
    fireEvent.click(submit);
    expect(await within(dialog).findByText('Асель Токтогулова')).toBeInTheDocument();
    expect(within(dialog).getByText(AUDIT_ID)).toBeInTheDocument();
    expect(within(dialog).getByText(/7Б · Школа №1/)).toBeInTheDocument();
    expect(api.find('POST', `/admin/users/${PUPIL_ID}/reveal`)[0].body).toEqual({ ground: 'parent_request', reason: 'Письмо родителя о переводе в другую школу', reference: 'ВХ-2026/118' });

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Закрыть' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Асель Токтогулова')).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain('Асель');
    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть данные (с основанием)' }));
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Раскрыть' })).toBeDisabled();
  });

  it('is offered only for pupils and only with platform.manage', async () => {
    mockApi({ 'GET /admin/users/:id': { body: pupil } });
    const view = renderAdmin(`/admin/users/${PUPIL_ID}`, { me: meFixture(PERMISSIONS.filter((p) => p !== 'platform.manage')) });
    await screen.findByText(/Ученик 7Б-12/);
    expect(screen.queryByRole('button', { name: 'Раскрыть данные (с основанием)' })).toBeNull();
    view.unmount();

    mockApi({ 'GET /admin/users/:id': { body: { ...pupil, kind: 'adult', email: 'a@school.kg' } } });
    renderAdmin(`/admin/users/${PUPIL_ID}`);
    await screen.findByText(/Ученик 7Б-12/);
    expect(screen.queryByRole('button', { name: 'Раскрыть данные (с основанием)' })).toBeNull();
  });
});
