import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@bilig/permissions';
import { animalCellPackage as pkg } from '@bilig/content-model/fixtures/animal-cell';
import { ADMIN_ID, meFixture, mockApi, page, renderAdmin, type Call } from '../test/utils';

const TOPIC = '00000000-0000-4000-8000-000000000006';
const OTHER = '00000000-0000-4000-8000-000000000009';
const now = '2026-10-15T10:00:00.000Z';
const detail = { id: TOPIC, key: pkg.topic.key, unitKey: pkg.topic.unitKey, status: 'review', publishedVersion: '1.0.0', latestVersion: '1.1.0', updatedAt: now, version: 5, demo: false, subjectKey: pkg.subject.key, availableActions: ['reject', 'publish'] };
const comment = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> & { id: string; body: string; resolvedAt?: string } => ({ id, targetType: 'topic', targetId: TOPIC, path: 'title.ky', body: 'Опечатка', authorId: ADMIN_ID, createdAt: now, topicVersion: '1.1.0', ...extra });
const C1 = '00000000-0000-4000-8000-0000000000c1';
const C2 = '00000000-0000-4000-8000-0000000000c2';

function setup() {
  const store = [comment(C1), comment(C2, { authorId: OTHER, body: 'Чужой', resolvedAt: now, resolvedBy: ADMIN_ID })];
  return mockApi({
    'GET /admin/topics/:id': { body: detail },
    'GET /admin/topics/:id/versions/:v': { body: { id: OTHER, topicKey: 'animal-cell', version: '1.1.0', doc: pkg.topic, authorId: ADMIN_ID, createdAt: now, reviewState: 'review' } },
    'GET /admin/users/:id': { body: { id: OTHER, kind: 'adult', displayName: 'Нурлан', status: 'active', grants: [], createdAt: now } },
    'GET /admin/review-comments': (c: Call) => ({ body: page(store.filter((x) => (c.query.get('resolved') === 'false' ? !x.resolvedAt : true))) }),
    'POST /admin/review-comments': (c: Call) => {
      const b = c.body as Record<string, unknown>;
      const rec = comment('00000000-0000-4000-8000-0000000000c3', b);
      store.push(rec);
      return { body: rec };
    },
    'PATCH /admin/review-comments/:id': (c: Call, p) => {
      const x = store.find((s) => s.id === p.id)!;
      const b = c.body as { resolved?: boolean; body?: string };
      if (b.body) x.body = b.body;
      if (b.resolved === true) Object.assign(x, { resolvedAt: now, resolvedBy: ADMIN_ID });
      if (b.resolved === false) Object.assign(x, { resolvedAt: undefined, resolvedBy: undefined });
      return { body: x };
    },
    'POST /admin/topics/:id/reject': { body: { topicKey: 'animal-cell', status: 'draft', version: '1.1.0' } },
  });
}

describe('A-14 review comments', () => {
  it('lists open comments from the server, adds one against the version under review and resolves it', async () => {
    const api = setup();
    renderAdmin(`/admin/review/${TOPIC}`);
    const c1 = await screen.findByTestId(`comment-${C1}`);
    expect(within(c1).getByText('Опечатка')).toBeInTheDocument();
    expect(within(c1).getByText(/вы/)).toBeInTheDocument();
    expect(screen.queryByTestId(`comment-${C2}`)).toBeNull();
    const list = api.find('GET', '/admin/review-comments')[0].query;
    expect(Object.fromEntries(list)).toMatchObject({ targetType: 'topic', targetId: TOPIC, resolved: 'false' });

    fireEvent.change(screen.getByLabelText('Поле (путь)'), { target: { value: 'scene' } });
    fireEvent.change(screen.getByLabelText('Текст'), { target: { value: 'Метка не там' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить комментарий' }));
    await waitFor(() => expect(api.find('POST', '/admin/review-comments')).toHaveLength(1));
    expect(api.find('POST', '/admin/review-comments')[0].body).toEqual({ targetType: 'topic', targetId: TOPIC, path: 'scene', body: 'Метка не там', topicVersion: '1.1.0' });
    expect(await screen.findByText('Метка не там')).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId(`comment-${C1}`)).getByRole('button', { name: 'Отметить решённым' }));
    await waitFor(() => expect(api.find('PATCH', `/admin/review-comments/${C1}`)[0]?.body).toEqual({ resolved: true }));
    await waitFor(() => expect(screen.queryByTestId(`comment-${C1}`)).toBeNull());
  });

  it('shows resolved comments on demand with author names; only the author may edit the text', async () => {
    const api = setup();
    renderAdmin(`/admin/review/${TOPIC}`);
    await screen.findByTestId(`comment-${C1}`);
    fireEvent.click(screen.getByLabelText('Показывать решённые'));
    const c2 = await screen.findByTestId(`comment-${C2}`);
    await waitFor(() => expect(within(c2).getByText(/Нурлан/)).toBeInTheDocument());
    expect(within(c2).getByText('решён')).toBeInTheDocument();
    expect(within(c2).queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(within(c2).getByRole('button', { name: 'Открыть снова' })).toBeInTheDocument();

    const c1 = screen.getByTestId(`comment-${C1}`);
    fireEvent.click(within(c1).getByRole('button', { name: 'Изменить' }));
    fireEvent.change(within(c1).getByLabelText('Текст'), { target: { value: 'Опечатка в ky' } });
    fireEvent.click(within(c1).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.find('PATCH', `/admin/review-comments/${C1}`)[0]?.body).toEqual({ body: 'Опечатка в ky' }));
  });

  it('returns the topic with the summary only (the server keeps the reason as a comment)', async () => {
    const api = setup();
    renderAdmin(`/admin/review/${TOPIC}`);
    await screen.findByTestId(`comment-${C1}`);
    fireEvent.change(screen.getByLabelText('Причина'), { target: { value: 'Доработать подписи' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть с комментариями' }));
    await waitFor(() => expect(api.find('POST', `/admin/topics/${TOPIC}/reject`)).toHaveLength(1));
    expect(api.find('POST', `/admin/topics/${TOPIC}/reject`)[0].body).toEqual({ reason: 'Доработать подписи' });
    expect(await screen.findByText('Тема возвращена автору.')).toBeInTheDocument();
  });

  it('offers comments an earlier build kept in this browser for upload once, then clears them', async () => {
    const api = setup();
    localStorage.setItem(`bilig.admin.review.${TOPIC}`, JSON.stringify([{ id: 'x', path: '$', body: 'Старый', createdAt: now }]));
    renderAdmin(`/admin/review/${TOPIC}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Загрузить на сервер (1)' }));
    await waitFor(() => expect(api.find('POST', '/admin/review-comments')).toHaveLength(1));
    expect(api.find('POST', '/admin/review-comments')[0].body).toEqual({ targetType: 'topic', targetId: TOPIC, path: '', body: 'Старый' });
    await waitFor(() => expect(localStorage.getItem(`bilig.admin.review.${TOPIC}`)).toBeNull());
    expect(screen.queryByRole('button', { name: /Загрузить на сервер/ })).toBeNull();
  });

  it('hides writing and resolving without content.draft.edit', async () => {
    setup();
    renderAdmin(`/admin/review/${TOPIC}`, { me: meFixture(PERMISSIONS.filter((p) => p !== 'content.draft.edit')) });
    expect(await screen.findByText('Вернуть на доработку')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить комментарий' })).toBeNull();
  });
});
