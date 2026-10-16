import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { L, fail, mockApi, page, rec, renderAdmin } from '../test/utils';
import { readDraft } from './draft';

const subject = (title: string) => ({ key: 'bio', title: L(title, 'Биология-ky', 'Biology'), icon: 'leaf', hue: 140, group: 'natural', order: 1, status: 'live' as const });

describe('optimistic locking: 409 conflict flow', () => {
  function setup() {
    let serverVersion = 3;
    let serverTitle = 'Биология';
    const api = mockApi({
      'GET /admin/subjects/:key': () => ({ body: rec(subject(serverTitle), serverVersion) }),
      'GET /admin/groups': { body: page([]) },
      'PATCH /admin/subjects/:key': (c) => {
        const v = Number(String(c.headers['if-match']).replace(/"/g, ''));
        if (v !== serverVersion) return fail('version_mismatch');
        serverVersion += 1;
        serverTitle = (c.body as { title: { ru: string } }).title.ru;
        return { body: rec(subject(serverTitle), serverVersion) };
      },
    });
    return {
      api,
      concurrentEdit(title: string) {
        serverVersion = 4;
        serverTitle = title;
      },
    };
  }

  it('sends If-Match, shows both versions on 409, and "keep mine" re-saves on top of the new version', async () => {
    const { api, concurrentEdit } = setup();
    renderAdmin('/admin/subjects/bio');
    const ru = (await screen.findAllByDisplayValue('Биология'))[0];
    fireEvent.change(ru, { target: { value: 'Биология 7' } });
    concurrentEdit('Биология (чужая правка)');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const dialog = await screen.findByRole('dialog', { name: 'Запись изменилась' });
    expect(dialog).toHaveTextContent('версия 3');
    expect(dialog).toHaveTextContent('версию 4');
    expect(dialog).toHaveTextContent('Биология (чужая правка)');
    expect(dialog).toHaveTextContent('Биология 7');
    const patches = api.find('PATCH', '/admin/subjects/bio');
    expect(patches[0].headers['if-match']).toBe('"3"');
    expect(patches[0].body).toMatchObject({ version: 3 });
    expect(patches[0].body).not.toHaveProperty('key');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить мою поверх' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const last = api.find('PATCH', '/admin/subjects/bio').at(-1)!;
    expect(last.headers['if-match']).toBe('"4"');
    expect((last.body as { title: { ru: string } }).title.ru).toBe('Биология 7');
    expect(await screen.findByText('версия 5')).toBeInTheDocument();
  });

  it('"take theirs" discards my edit and adopts the server version', async () => {
    const { api, concurrentEdit } = setup();
    renderAdmin('/admin/subjects/bio');
    const ru = (await screen.findAllByDisplayValue('Биология'))[0];
    fireEvent.change(ru, { target: { value: 'Мой вариант' } });
    concurrentEdit('Их вариант');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Взять их версию' }));
    expect((await screen.findAllByDisplayValue('Их вариант')).length).toBeGreaterThan(0);
    expect(screen.getByText('версия 4')).toBeInTheDocument();
    expect(api.find('PATCH', '/admin/subjects/bio')).toHaveLength(1);
  });

  it('autosaves the unsaved edit as a local draft and offers it back', async () => {
    setup();
    const view = renderAdmin('/admin/subjects/bio');
    const ru = (await screen.findAllByDisplayValue('Биология'))[0];
    fireEvent.change(ru, { target: { value: 'Черновик' } });
    await waitFor(() => expect(readDraft<{ title: { ru: string } }>('subjects:bio')?.value.title.ru).toBe('Черновик'), { timeout: 2000 });
    view.unmount();
    renderAdmin('/admin/subjects/bio');
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    expect((await screen.findAllByDisplayValue('Черновик')).length).toBeGreaterThan(0);
  });
});
