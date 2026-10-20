/**
 * v0.8.0 staff side: role routing after sign-in, navigation from
 * permissions, staff management, teachers, support sessions (view / edit,
 * banner, exit back to the admin, read-only toast, expiry), the journal
 * (filters → query, CSV) and deletion requests.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@bilig/content-model/api';
import clientI18n from '../../i18n';
import { api as clientApi } from '../../api/client';
import { useSession as useClientSession } from '../../api/session';
import { useUi } from '../../state/ui';
import { SupportBanner } from '../../support/SupportBanner';
import { exitSupport, useSupport } from '../../support/store';
import { supportAuth } from '../../support/token';
import AdminApp from '../index';
import { resetSession, useSession } from '../api/session';
import { useAdminLang } from '../i18n';
import { ADMIN_ID, currentUrl, fail, meFixture, mockApi, page, renderAdmin, testI18n, type Handler } from '../test/utils';

configure({ asyncUtilTimeout: 5000 });

const T1 = '00000000-0000-4000-8000-0000000000b1';
const T2 = '00000000-0000-4000-8000-0000000000b2';
const M1 = '00000000-0000-4000-8000-0000000000c1';
const S2 = '00000000-0000-4000-8000-0000000000c2';
const SESSION = '00000000-0000-4000-8000-0000000000d1';
const now = '2026-10-20T10:00:00.000Z';

const teacher = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: name,
  phone: '+996555000001',
  email: null,
  schoolName: 'Бишкек ш., №5 мектеп',
  region: 'Бишкек',
  teachingLang: 'ky',
  classes: 2,
  subjects: ['bio'],
  profileStatus: 'complete',
  status: 'active',
  createdAt: now,
  lastActiveAt: now,
  ...extra,
});
const member = (userId: string, name: string, role: 'manager' | 'superadmin', extra: Record<string, unknown> = {}) => ({
  userId,
  email: `${name.toLowerCase()}@bilig.kg`,
  displayName: name,
  role,
  permissions: role === 'manager' ? ['teacher.view'] : [],
  status: 'active',
  totpEnabled: true,
  createdAt: now,
  createdBy: null,
  lastLoginAt: now,
  ...extra,
});
const managerMe = (permissions: string[]): MeResponse => ({
  ...meFixture(['demo.view', 'topic.view', 'assistant.ask.online', ...permissions]),
  id: M1,
  displayName: 'Бермет',
  grants: [{ role: 'manager', scope: 'platform' }],
});
const teacherMe: MeResponse = { id: T1, kind: 'adult', displayName: 'Гүлнара Асанова', locale: 'ky', grants: [{ role: 'teacher', scope: 'school', scopeId: T2 }], permissions: ['topic.view', 'class.manage', 'lesson.plan'] };
const token = (t: string) => ({ accessToken: t, tokenType: 'Bearer', expiresIn: 900 });
const dashboard: Record<string, Handler> = { 'GET /admin/topics': { body: page([]) }, 'GET /admin/strings': { body: page([]) }, 'GET /admin/builds': { body: page([]) } };
const navLabels = () => within(screen.getByRole('navigation', { name: 'Разделы админки' })).getAllByRole('link').map((a) => a.textContent);

beforeAll(async () => {
  await clientI18n.changeLanguage('ru');
});
afterEach(() => {
  void exitSupport('user');
  useSupport.setState({ active: null, lost: false, notice: null });
  supportAuth.set(null);
  useUi.setState({ toasts: [] });
});

describe('staff sign-in: the role decides', () => {
  const signIn = async (me: MeResponse, extra: Record<string, Handler> = {}) => {
    const api = mockApi({
      'POST /auth/refresh': fail('unauthorized'),
      'POST /auth/login': (c) => ((c.body as { totp?: string }).totp === '012345' ? { body: token('acc') } : fail('totp_required')),
      'GET /me': { body: me },
      ...dashboard,
      ...extra,
    });
    renderAdmin('/admin', { me: null });
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'x@bilig.kg' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'bilig-staff-2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.change(await screen.findByLabelText('Код из приложения (6 цифр)'), { target: { value: '012345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    return api;
  };

  it('SuperAdmin lands on the dashboard', async () => {
    await signIn(meFixture());
    expect(await screen.findByRole('heading', { name: 'Дашборд' })).toBeInTheDocument();
  });

  it('a manager without content rights lands on their first section (Учителя)', async () => {
    await signIn(managerMe(['teacher.view', 'audit.read']), { 'GET /admin/teachers': { body: page([teacher(T1, 'Гүлнара Асанова')]) } });
    expect(await screen.findByRole('heading', { name: 'Учителя', level: 1 })).toBeInTheDocument();
    expect(currentUrl().pathname).toBe('/admin/teachers');
  });

  it('a teacher gets «Это вход для сотрудников» and the way to the teacher sign-in', async () => {
    const api = await signIn(teacherMe, { 'POST /auth/logout': { body: { ok: true } } });
    expect(await screen.findByRole('heading', { name: 'Это вход для сотрудников' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Войти как учитель' }));
    await waitFor(() => expect(currentUrl().pathname).toBe('/ru/login'));
    expect(api.find('POST', '/auth/logout')).toHaveLength(1);
  });
});

describe('navigation from me.permissions', () => {
  it('a manager sees only the sections they were given, with plain labels', async () => {
    mockApi({ 'GET /admin/teachers': { body: page([]) } });
    renderAdmin('/admin/teachers', { me: managerMe(['teacher.view', 'audit.read', 'deletion.request']) });
    await screen.findByRole('heading', { name: 'Учителя', level: 1 });
    const labels = navLabels();
    expect(labels).toEqual(expect.arrayContaining(['Учителя', 'Запросы на удаление', 'Журнал действий']));
    expect(labels).not.toContain('Сотрудники');
    expect(labels).not.toContain('Темы');
  });

  it('SuperAdmin also sees «Сотрудники»', async () => {
    mockApi({ ...dashboard });
    renderAdmin('/admin');
    await screen.findByRole('heading', { name: 'Дашборд' });
    expect(navLabels()).toEqual(expect.arrayContaining(['Учителя', 'Журнал действий', 'Запросы на удаление', 'Сотрудники']));
  });
});

describe('Сотрудники', () => {
  const staff = () => ({ items: [member(ADMIN_ID, 'Admin', 'superadmin', { email: 'admin@bilig.kg' }), member(M1, 'Bermet', 'manager')] });

  it('locks your own row and warns when fewer than two SuperAdmins are active', async () => {
    mockApi({ 'GET /admin/staff': { body: staff() } });
    renderAdmin('/admin/staff');
    const own = await screen.findByTestId('staff-row-admin@bilig.kg');
    expect(within(own).getByText('Свою запись менять нельзя')).toBeInTheDocument();
    expect(within(own).queryByRole('button')).toBeNull();
    expect(within(screen.getByTestId('staff-row-bermet@bilig.kg')).getByRole('button', { name: 'Управлять: Bermet' })).toBeInTheDocument();
    expect(screen.getByText(/Активных SuperAdmin: 1/)).toBeInTheDocument();
  });

  it('invites a manager with the ticked permissions', async () => {
    const api = mockApi({ 'GET /admin/staff': { body: staff() }, 'POST /admin/staff/invites': { body: { ok: true } } });
    renderAdmin('/admin/staff');
    fireEvent.click(await screen.findByRole('button', { name: 'Пригласить менеджера' }));
    const dialog = await screen.findByRole('dialog', { name: 'Пригласить менеджера' });
    // the groups the SuperAdmin sees
    for (const g of ['Учителя', 'Контент', 'Журнал', 'Удаление']) expect(within(dialog).getByText(g, { selector: 'legend' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Имя и фамилия'), { target: { value: 'Нурбек Абдыкадыров' } });
    fireEvent.change(within(dialog).getByLabelText('Рабочий e-mail'), { target: { value: 'nurbek@bilig.kg' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Править в кабинете учителя/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Журнал действий/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отправить приглашение' }));
    await waitFor(() => expect(api.find('POST', '/admin/staff/invites')).toHaveLength(1));
    expect(api.find('POST', '/admin/staff/invites')[0].body).toEqual({
      email: 'nurbek@bilig.kg',
      displayName: 'Нурбек Абдыкадыров',
      permissions: ['teacher.view', 'teacher.edit', 'audit.read'],
    });
  });

  it('blocks a manager only with a reason', async () => {
    const api = mockApi({ 'GET /admin/staff': { body: staff() }, 'POST /admin/staff/:id/block': () => ({ body: { ...member(M1, 'Bermet', 'manager'), status: 'blocked' } }) });
    renderAdmin('/admin/staff');
    fireEvent.click(await screen.findByRole('button', { name: 'Управлять: Bermet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Заблокировать' }));
    const confirm = await screen.findByRole('dialog', { name: 'Заблокировать: Bermet?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Да, заблокировать' }));
    expect(await within(confirm).findByText('Напишите причину — не меньше 3 символов')).toBeInTheDocument();
    expect(api.find('POST', /block$/)).toHaveLength(0);
    fireEvent.change(within(confirm).getByLabelText('Причина'), { target: { value: 'Ушёл из проекта' } });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Да, заблокировать' }));
    await waitFor(() => expect(api.find('POST', `/admin/staff/${M1}/block`)[0]?.body).toEqual({ reason: 'Ушёл из проекта' }));
  });
});

describe('Учителя', () => {
  it('searches and filters through the URL and the list query', async () => {
    const api = mockApi({ 'GET /admin/teachers': (c) => ({ body: page(c.query.get('q') ? [teacher(T2, 'Ольга Ким')] : [teacher(T1, 'Гүлнара Асанова')]) }) });
    renderAdmin('/admin/teachers');
    await screen.findByRole('link', { name: 'Гүлнара Асанова' });
    fireEvent.change(screen.getByLabelText('Поиск'), { target: { value: 'Ким' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByRole('link', { name: 'Ольга Ким' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Профиль'), { target: { value: 'incomplete' } });
    await waitFor(() => expect(api.find('GET', '/admin/teachers').at(-1)!.query.get('profileStatus')).toBe('incomplete'));
    const last = api.find('GET', '/admin/teachers').at(-1)!;
    expect(last.query.get('q')).toBe('Ким');
    expect(currentUrl().search).toContain('q=%D0%9A%D0%B8%D0%BC');
  });
});

/** Admin + the teacher cabinet route (the banner and the client session) in one router. */
function renderWithCabinet(path: string, me: MeResponse = meFixture()) {
  resetSession();
  useAdminLang.setState({ lang: 'ru' });
  useSession.setState({ token: 'admin-token', me, status: 'authenticated' });
  useClientSession.setState({ status: 'guest', me: null, permissions: [] });
  const host = new QueryClient();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  function Cabinet() {
    const who = useClientSession((s) => s.me?.displayName);
    return (
      <I18nextProvider i18n={clientI18n}>
        <SupportBanner />
        <h1>cabinet of {who}</h1>
      </I18nextProvider>
    );
  }
  function Probe() {
    const loc = useLocation();
    return <output data-testid="location">{loc.pathname + loc.search}</output>;
  }
  render(
    <QueryClientProvider client={host}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp i18n={testI18n()} queryClient={qc} />} />
          <Route path="/:lang/teacher" element={<Cabinet />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return host;
}

const startResponse = (mode: 'view' | 'edit', ttl = 900) => ({
  session: {
    id: SESSION,
    mode,
    teacher: { id: T1, displayName: 'Гүлнара Асанова' },
    actor: { id: ADMIN_ID, displayName: 'Admin', role: 'superadmin' },
    reason: mode === 'edit' ? 'Исправить название класса' : null,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    endedAt: null,
  },
  accessToken: 'support-token',
  tokenType: 'Bearer',
  expiresIn: ttl,
});

function supportApi(mode: 'view' | 'edit', ttl = 900) {
  return mockApi({
    'GET /admin/teachers/:id': { body: teacher(T1, 'Гүлнара Асанова') },
    'POST /admin/teachers/:id/support': (c) => ({ body: startResponse((c.body as { mode: 'view' | 'edit' }).mode ?? mode, ttl) }),
    'POST /admin/support/:id/end': { body: { ok: true } },
    'GET /me': (c) =>
      c.headers.authorization === 'Bearer support-token'
        ? { body: { ...teacherMe, support: { sessionId: SESSION, mode, actor: { id: ADMIN_ID, displayName: 'Admin' }, expiresAt: startResponse(mode).session.expiresAt } } }
        : fail('unauthorized'),
    'PATCH /me': fail('forbidden', { detail: 'support_read_only' }),
  });
}

describe('support sessions: the teacher cabinet from the admin', () => {
  it('«Открыть кабинет» starts a view session, switches the same tab to the cabinet with the banner; «Выйти в админку» ends it and restores the admin', async () => {
    const api = supportApi('view');
    const host = renderWithCabinet(`/admin/teachers/${T1}`);
    const hostClear = vi.spyOn(host, 'clear');
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть кабинет' }));

    expect(await screen.findByRole('heading', { name: 'cabinet of Гүлнара Асанова' })).toBeInTheDocument();
    expect(currentUrl().pathname).toBe('/ru/teacher');
    expect(api.find('POST', `/admin/teachers/${T1}/support`)[0].body).toEqual({ mode: 'view' });
    // the client works with the support token, in memory only
    const me = api.find('GET', '/me').at(-1)!;
    expect(me.headers.authorization).toBe('Bearer support-token');
    expect(JSON.stringify({ ...localStorage })).not.toContain('support-token');
    expect(JSON.stringify({ ...localStorage })).not.toContain('Гүлнара');
    expect(hostClear).toHaveBeenCalled();

    const banner = screen.getByTestId('support-banner');
    expect(banner).toHaveTextContent('Вы в кабинете: Гүлнара Асанова.');
    expect(banner).toHaveTextContent('Режим поддержки: просмотр');
    expect(banner).toHaveTextContent(/осталось 1[45]:\d\d/);

    fireEvent.click(within(banner).getByRole('button', { name: 'Выйти в админку' }));
    await waitFor(() => expect(currentUrl().pathname).toBe(`/admin/teachers/${T1}`));
    const end = api.find('POST', `/admin/support/${SESSION}/end`);
    expect(end).toHaveLength(1);
    expect(end[0].headers.authorization).toBe('Bearer admin-token');
    expect(await screen.findByRole('heading', { name: 'Гүлнара Асанова', level: 1 })).toBeInTheDocument();
    // the admin session is intact, the client is back to its own (guest) session
    expect(useSession.getState().token).toBe('admin-token');
    expect(useClientSession.getState().status).toBe('guest');
    expect(supportAuth.get()).toBeNull();
  });

  it('«Режим правки» needs a reason (≥ 10) and the 2FA code', async () => {
    const api = supportApi('edit');
    renderWithCabinet(`/admin/teachers/${T1}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Режим правки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Режим правки: Гүлнара Асанова' });
    fireEvent.change(within(dialog).getByLabelText('Причина (что нужно исправить)'), { target: { value: 'коротко' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Открыть в режиме правки' }));
    expect(await within(dialog).findByText('Напишите причину — не меньше 10 символов')).toBeInTheDocument();
    expect(within(dialog).getByText('Введите 6 цифр кода')).toBeInTheDocument();
    expect(api.find('POST', `/admin/teachers/${T1}/support`)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Причина (что нужно исправить)'), { target: { value: 'Исправить название класса' } });
    fireEvent.change(within(dialog).getByLabelText('Код 2FA из приложения'), { target: { value: '012345' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Открыть в режиме правки' }));
    expect(await screen.findByTestId('support-banner')).toHaveTextContent('Режим поддержки: правка');
    expect(api.find('POST', `/admin/teachers/${T1}/support`)[0].body).toEqual({ mode: 'edit', reason: 'Исправить название класса', totp: '012345' });
  });

  it('a write in view mode shows the read-only toast', async () => {
    const api = supportApi('view');
    renderWithCabinet(`/admin/teachers/${T1}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть кабинет' }));
    await screen.findByTestId('support-banner');
    await act(async () => {
      await clientApi('mePatch', { body: { displayName: 'x' } }).catch(() => undefined);
    });
    expect(api.find('PATCH', '/me')[0].headers.authorization).toBe('Bearer support-token');
    expect(useUi.getState().toasts.map((t) => t.key)).toContain('support.readOnly');
  });

  it('expiry exits by itself and tells the admin why', async () => {
    supportApi('view', 1);
    renderWithCabinet(`/admin/teachers/${T1}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть кабинет' }));
    await screen.findByTestId('support-banner');
    await waitFor(() => expect(currentUrl().pathname).toBe(`/admin/teachers/${T1}`), { timeout: 4000 });
    expect(await screen.findAllByText('Время сеанса поддержки истекло — вы вернулись в админку.')).not.toHaveLength(0);
  });
});

describe('Журнал действий', () => {
  const ev = {
    id: '00000000-0000-4000-8000-0000000000e1',
    seq: 7,
    at: now,
    actor: { id: M1, displayName: 'Бермет', role: 'manager' },
    onBehalfOf: { id: T1, displayName: 'Гүлнара Асанова' },
    group: 'teacher_data',
    action: 'teacher_data.class_changed',
    target: { type: 'class', id: 'c1', label: '7А' },
    before: { name: '7 а' },
    after: { name: '7А' },
    reason: null,
    result: 'ok',
    ip: '10.0.0.1',
    userAgent: 'Chrome',
    requestId: 'req-1',
    supportSessionId: SESSION,
  };
  const routes = (): Record<string, Handler> => ({
    'GET /admin/journal': { body: page([ev]) },
    'GET /admin/staff': { body: { items: [member(M1, 'Бермет', 'manager', { email: 'bermet@bilig.kg' })] } },
    'GET /admin/journal/alerts': { body: { items: [{ id: '00000000-0000-4000-8000-0000000000f1', at: now, kind: 'mass_deletion', actor: { id: S2, displayName: 'Тимур' }, summary: '12 удалений за 6 минут', seenAt: null }] } },
    'POST /admin/journal/alerts/:id/seen': { body: { ok: true } },
    'GET /admin/journal/verify': { body: { ok: true, checked: 42, brokenAt: null } },
    'GET /admin/journal/export': { status: 200, body: 'seq,at\n7,x', headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="journal.csv"' } },
  });

  it('URL filters become the journal query; the row opens the diff', async () => {
    const api = mockApi(routes());
    renderAdmin('/admin/journal?group=support&result=denied&from=2026-10-01&to=2026-10-02');
    expect(await screen.findByText('Изменён класс')).toBeInTheDocument();
    const q = api.find('GET', '/admin/journal')[0].query;
    expect(q.get('group')).toBe('support');
    expect(q.get('result')).toBe('denied');
    expect(q.get('from')).toBe(new Date('2026-10-01T00:00:00').toISOString());
    expect(q.get('to')).toBe(new Date('2026-10-02T23:59:59.999').toISOString());

    await screen.findByRole('option', { name: 'Бермет' });
    fireEvent.change(screen.getByLabelText('Сотрудник'), { target: { value: M1 } });
    await waitFor(() => expect(api.find('GET', '/admin/journal').at(-1)!.query.get('actorId')).toBe(M1));
    expect(currentUrl().search).toContain(`actorId=${M1}`);

    fireEvent.click(await screen.findByRole('button', { name: /Подробнее: Изменён класс/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Изменён класс' });
    expect(within(drawer).getByText('"7 а"'.replace(/"/g, ''))).toBeInTheDocument();
    expect(within(drawer).getByText('7А', { selector: 'td' })).toBeInTheDocument();
    expect(within(drawer).getByText('req-1')).toBeInTheDocument();
  });

  it('exports the filtered journal as CSV; SuperAdmin checks the chain and marks an alert seen', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const created = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const api = mockApi(routes());
    renderAdmin('/admin/journal?group=staff');
    await screen.findByText('Изменён класс');
    fireEvent.click(screen.getByRole('button', { name: 'Скачать CSV' }));
    await waitFor(() => expect(api.find('GET', '/admin/journal/export')).toHaveLength(1));
    expect(api.find('GET', '/admin/journal/export')[0].query.get('group')).toBe('staff');
    await waitFor(() => expect(created).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Проверить цепочку' }));
    expect(await screen.findByText('Цепочка цела. Проверено записей: 42.')).toBeInTheDocument();
    fireEvent.click(within(await screen.findByTestId('alert-00000000-0000-4000-8000-0000000000f1')).getByRole('button', { name: 'Просмотрено' }));
    await waitFor(() => expect(api.find('POST', '/admin/journal/alerts/00000000-0000-4000-8000-0000000000f1/seen')).toHaveLength(1));
  });
});

describe('Запросы на удаление', () => {
  const req = (id: string, label: string) => ({
    id,
    kind: 'teacher',
    targetId: T2,
    targetLabel: label,
    reason: 'Дубликат учётной записи',
    status: 'pending',
    requestedBy: { id: M1, displayName: 'Бермет' },
    requestedAt: now,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  });
  const R1 = '00000000-0000-4000-8000-0000000000a1';
  const R2 = '00000000-0000-4000-8000-0000000000a2';

  it('SuperAdmin approves with the 2FA code and rejects with a note', async () => {
    const api = mockApi({
      'GET /admin/deletion-requests': { body: page([req(R1, 'Азамат'), req(R2, 'Дилноза')]) },
      'POST /admin/deletion-requests/:id/approve': (_c, p) => ({ body: { ...req(p.id, 'Азамат'), status: 'approved' } }),
      'POST /admin/deletion-requests/:id/reject': (_c, p) => ({ body: { ...req(p.id, 'Дилноза'), status: 'rejected' } }),
    });
    renderAdmin('/admin/deletions');
    expect(api.find('GET', '/admin/deletion-requests')[0]?.query.get('status') ?? 'pending').toBe('pending');
    fireEvent.click(within(await screen.findByTestId(`deletion-${R1}`)).getByRole('button', { name: 'Одобрить' }));
    let dialog = await screen.findByRole('dialog', { name: 'Одобрить удаление: Азамат?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Одобрить и удалить' }));
    expect(await within(dialog).findByText('Введите 6 цифр кода')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Код 2FA из приложения'), { target: { value: '012345' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Одобрить и удалить' }));
    await waitFor(() => expect(api.find('POST', `/admin/deletion-requests/${R1}/approve`)[0]?.body).toEqual({ totp: '012345' }));

    fireEvent.click(within(await screen.findByTestId(`deletion-${R2}`)).getByRole('button', { name: 'Отклонить' }));
    dialog = await screen.findByRole('dialog', { name: 'Отклонить запрос: Дилноза?' });
    fireEvent.change(within(dialog).getByLabelText('Комментарий для менеджера'), { target: { value: 'Учитель активен' } });
    fireEvent.change(within(dialog).getByLabelText('Код 2FA из приложения'), { target: { value: '012345' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отклонить' }));
    await waitFor(() => expect(api.find('POST', `/admin/deletion-requests/${R2}/reject`)[0]?.body).toEqual({ totp: '012345', note: 'Учитель активен' }));
  });

  it('a manager requests the deletion of a teacher from the teacher page', async () => {
    const api = mockApi({
      'GET /admin/teachers/:id': { body: teacher(T2, 'Азамат Бейшеев', { profileStatus: 'incomplete' }) },
      'POST /admin/deletion-requests': (c) => ({ body: { ...req(R1, 'Азамат Бейшеев'), reason: (c.body as { reason: string }).reason } }),
    });
    renderAdmin(`/admin/teachers/${T2}`, { me: managerMe(['teacher.view', 'deletion.request']) });
    fireEvent.click(await screen.findByRole('button', { name: 'Запросить удаление' }));
    const dialog = await screen.findByRole('dialog', { name: 'Запросить удаление: Азамат Бейшеев' });
    fireEvent.change(within(dialog).getByLabelText('Причина'), { target: { value: 'Дубликат учётной записи' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отправить запрос' }));
    await waitFor(() => expect(api.find('POST', '/admin/deletion-requests')[0]?.body).toEqual({ kind: 'teacher', targetId: T2, reason: 'Дубликат учётной записи' }));
    // no edit mode without teacher.edit
    expect(screen.queryByRole('button', { name: 'Режим правки' })).toBeNull();
  });
});
