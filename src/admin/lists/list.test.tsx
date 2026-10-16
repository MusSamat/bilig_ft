import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { currentUrl, L, meFixture, mockApi, page, rec, renderAdmin } from '../test/utils';

const concept = (key: string, kind = 'organelle') => ({
  key,
  kind,
  hue: 120,
  isContainer: false,
  title: L(key.toUpperCase()),
  description: L('d'),
  props: [],
  related: [],
  misconceptions: [],
  examples: { stem: [{ title: L('s'), text: L('s') }], simple: [{ title: L('p'), text: L('p') }] },
});

describe('admin lists: cursor pagination, URL filters, sorting, permissions', () => {
  it('sends URL filters to the API, pages with cursors forward and back, and resets paging on a new filter', async () => {
    const api = mockApi({
      'GET /admin/concepts': (c) =>
        c.query.get('cursor') === 'c2'
          ? { body: page([rec(concept('bio.ribosome'))], null) }
          : { body: page([rec(concept('bio.nucleus')), rec(concept('bio.cell-wall'))], 'c2') },
      'GET /admin/subjects': { body: page([]) },
    });
    renderAdmin('/admin/concepts?q=bio&subjectKey=bio');
    expect(await screen.findByText('bio.nucleus')).toBeInTheDocument();
    const first = api.find('GET', '/admin/concepts')[0];
    expect(first.query.get('q')).toBe('bio');
    expect(first.query.get('subjectKey')).toBe('bio');
    expect(first.query.get('limit')).toBe('25');
    expect(first.query.has('cursor')).toBe(false);
    expect(first.headers['x-bilig-audience']).toBe('admin');

    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));
    expect(await screen.findByText('bio.ribosome')).toBeInTheDocument();
    expect(currentUrl().searchParams.get('cursor')).toBe('c2');
    expect(currentUrl().searchParams.get('q')).toBe('bio');
    expect(api.find('GET', '/admin/concepts').at(-1)!.query.get('cursor')).toBe('c2');
    expect(screen.getByText('Страница 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Дальше/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Назад/ }));
    expect(await screen.findByText('bio.nucleus')).toBeInTheDocument();
    expect(currentUrl().searchParams.has('cursor')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Дальше/ }));
    await screen.findByText('bio.ribosome');
    const search = screen.getByLabelText('Поиск');
    fireEvent.change(search, { target: { value: 'nuc' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(currentUrl().searchParams.get('q')).toBe('nuc'));
    expect(currentUrl().searchParams.has('cursor')).toBe(false);
    expect(currentUrl().searchParams.has('trail')).toBe(false);
    await waitFor(() => expect(api.find('GET', '/admin/concepts').at(-1)!.query.get('q')).toBe('nuc'));
  });

  it('sorts by a column on the server and keeps the sort in the URL', async () => {
    const rows = [rec(concept('b.two', 'z-kind')), rec(concept('a.one', 'a-kind'))];
    // The server owns the order: the mock sorts by `sort` / `order`, the page is shown as returned.
    const api = mockApi({
      'GET /admin/concepts': (c) => {
        const sort = c.query.get('sort');
        if (!sort) return { body: page(rows) };
        const dir = c.query.get('order') === 'desc' ? -1 : 1;
        return { body: page([...rows].sort((x, y) => (x.data.kind < y.data.kind ? -1 : 1) * dir)) };
      },
    });
    renderAdmin('/admin/concepts');
    await screen.findByText('b.two');
    const keys = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2]?.textContent);
    fireEvent.click(screen.getByRole('button', { name: /Тип/ }));
    expect(currentUrl().searchParams.get('sort')).toBe('kind');
    await waitFor(() => expect(keys()).toEqual(['a.one', 'b.two']));
    fireEvent.click(screen.getByRole('button', { name: /Тип/ }));
    expect(currentUrl().searchParams.get('sort')).toBe('-kind');
    await waitFor(() => expect(keys()).toEqual(['b.two', 'a.one']));
    // Contract 0.3.0: list endpoints accept `sort`, so the order comes from the server (no "this page only" hint).
    await waitFor(() => {
      const q = api.find('GET', '/admin/concepts').at(-1)!.query;
      expect([q.get('sort'), q.get('order')]).toEqual(['kind', 'desc']);
    });
    expect(screen.queryByText(/сортируется только загруженная страница/)).toBeNull();
  });

  it('bulk delete sends If-Match per row and reports in_use refusals', async () => {
    const api = mockApi({
      'GET /admin/concepts': { body: page([rec(concept('bio.nucleus'), 3), rec(concept('bio.free'), 7)]) },
      'DELETE /admin/concepts/:key': (_c, p) => (p.key === 'bio.nucleus' ? { status: 409, body: { type: 'x', title: 'in use', status: 409, code: 'in_use', i18nKey: 'errors.in_use', detail: 'topic:animal-cell' } } : { body: { ok: true } }),
    });
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      renderAdmin('/admin/concepts');
      await screen.findByText('bio.nucleus');
      fireEvent.click(screen.getByLabelText('Выбрать все на странице'));
      fireEvent.click(screen.getByRole('button', { name: 'Удалить выбранные' }));
      await screen.findByText(/Не удалось: 1/);
      const dels = api.find('DELETE', /^\/admin\/concepts\//);
      expect(dels.map((d) => [d.path, d.headers['if-match']])).toEqual([
        ['/admin/concepts/bio.nucleus', '"3"'],
        ['/admin/concepts/bio.free', '"7"'],
      ]);
      expect(screen.getByText(/topic:animal-cell/)).toBeInTheDocument();
    } finally {
      window.confirm = confirm;
    }
  });

  it('hides actions the permission list does not allow', async () => {
    mockApi({ 'GET /admin/concepts': { body: page([rec(concept('bio.nucleus'))]) } });
    // a translator-like author: may list/edit drafts, but not publish nor manage the platform
    renderAdmin('/admin/concepts', { me: meFixture(['demo.view', 'topic.view', 'content.draft.edit']) });
    await screen.findByText('bio.nucleus');
    const nav = screen.getByRole('navigation', { name: 'Разделы админки' });
    expect(within(nav).getByText('Словарь понятий')).toBeInTheDocument();
    expect(within(nav).queryByText('Школы и лицензии')).toBeNull();
    expect(within(nav).queryByText('Журнал аудита')).toBeNull();
    expect(within(nav).queryByText('3D-ассеты')).toBeNull();
    // content.draft.edit can create/delete concepts
    expect(screen.getByRole('link', { name: /Создать/ })).toBeInTheDocument();
  });
});
