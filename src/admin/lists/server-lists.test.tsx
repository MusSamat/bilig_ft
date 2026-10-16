/** Contract 0.3.0 lists: server sort per field, the new filters, topic titles, dashboard queries, GET by key. */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { serverSortField, type Column } from './ListView';
import { serverSortable, type ListParams } from './useListParams';
import { L, currentUrl, mockApi, page, rec, renderAdmin } from '../test/utils';

configure({ asyncUtilTimeout: 5000 });

const topic = (key: string, title?: string) => ({
  id: `00000000-0000-4000-8000-0000000000${key.length.toString().padStart(2, '0')}`,
  key,
  unitKey: 'bio.cells',
  status: 'draft' as const,
  latestVersion: '1.0.0',
  updatedAt: '2026-10-01T10:00:00.000Z',
  version: 1,
  ...(title ? { title: L(title, `${title} ky`) } : {}),
  updatedBy: '0123abcd-0000-4000-8000-000000000009',
});
const unit = { key: 'bio.cells', courseKey: 'bio.7', title: L('Клетки'), order: 1, objectiveKeys: [] };

describe('server sort per field', () => {
  it('generic lists take any field name, fixed lists only their enum', () => {
    expect(serverSortable('adminConceptList', 'kind')).toBe(true);
    expect(serverSortable('adminTopicList', 'latestVersion')).toBe(true);
    expect(serverSortable('adminAudit', 'target')).toBe(true);
    expect(serverSortable('adminAudit', 'ip')).toBe(false);
    expect(serverSortable('adminBuildList', 'topicKey')).toBe(false);
    expect(serverSortable('me', 'x')).toBe(false);
  });

  it('maps a column to its server field and falls back to the page for unsupported ones', () => {
    const list = (field: string) => ({ sort: { field, dir: 'asc' } }) as ListParams;
    const cols: Column<unknown>[] = [{ key: 'when', header: '', render: () => null, sortValue: () => 1, sortField: 'ts' }];
    expect(serverSortField('adminAudit', list('when'), cols)).toBe('ts');
    expect(serverSortField('adminAudit', list('ip'), cols)).toBeUndefined();
    expect(serverSortField('adminAudit', { sort: undefined } as ListParams, cols)).toBeUndefined();
  });
});

describe('topic list (A-06/A-13)', () => {
  it('shows the localized title and last editor, and sends unit / mine / sort to the server', async () => {
    const api = mockApi({
      'GET /admin/topics': { body: page([topic('animal-cell', 'Клетка'), topic('dna')]) },
      'GET /admin/units': { body: page([rec(unit)]) },
      'GET /admin/subjects': { body: page([]) },
    });
    renderAdmin('/admin/topics');
    const row = (await screen.findByText('animal-cell')).closest('tr')!;
    expect(within(row).getByText('Клетка')).toBeInTheDocument();
    expect(within(row).getByText('0123abcd')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Только мои'));
    await waitFor(() => expect(currentUrl().searchParams.get('mine')).toBe('true'));
    await waitFor(() => expect(api.find('GET', '/admin/topics').at(-1)!.query.get('mine')).toBe('true'));

    await screen.findByRole('option', { name: /Клетки/ });
    fireEvent.change(screen.getByLabelText('Раздел'), { target: { value: 'bio.cells' } });
    await waitFor(() => expect(api.find('GET', '/admin/topics').at(-1)!.query.get('unitKey')).toBe('bio.cells'));

    fireEvent.click(screen.getByRole('button', { name: /Название/ }));
    await waitFor(() => {
      const q = api.find('GET', '/admin/topics').at(-1)!.query;
      expect([q.get('sort'), q.get('order'), q.get('mine'), q.get('unitKey')]).toEqual(['title', 'asc', 'true', 'bio.cells']);
    });
    expect(screen.queryByText(/сортируется только|упорядочена только/)).toBeNull();
  });
});

describe('dictionary filters and GET by key', () => {
  it('items: type and objective go to the server', async () => {
    const api = mockApi({
      'GET /admin/items': { body: page([]) },
      'GET /admin/objectives': { body: page([rec({ key: 'bio.o1', code: 'B7.1', unitKey: 'bio.cells', text: L('Цель') })]) },
      'GET /admin/subjects': { body: page([]) },
      'GET /admin/concepts': { body: page([]) },
    });
    renderAdmin('/admin/items?type=numeric');
    await waitFor(() => expect(api.find('GET', '/admin/items')[0]?.query.get('type')).toBe('numeric'));
    await screen.findByRole('option', { name: /B7.1/ });
    fireEvent.change(screen.getByLabelText('Цель обучения'), { target: { value: 'bio.o1' } });
    await waitFor(() => {
      const q = api.find('GET', '/admin/items').at(-1)!.query;
      expect([q.get('type'), q.get('objectiveKey')]).toEqual(['numeric', 'bio.o1']);
    });
  });

  it('concepts: kind goes to the server', async () => {
    const api = mockApi({ 'GET /admin/concepts': { body: page([]) }, 'GET /admin/subjects': { body: page([]) }, 'GET /admin/groups': { body: page([]) } });
    renderAdmin('/admin/concepts?kind=organelle');
    await waitFor(() => expect(api.find('GET', '/admin/concepts')[0]?.query.get('kind')).toBe('organelle'));
  });

  it('subjects list filters by status on the server', async () => {
    const api = mockApi({ 'GET /admin/subjects': { body: page([]) }, 'GET /admin/groups': { body: page([]) } });
    renderAdmin('/admin/subjects');
    await screen.findByText('Ничего не найдено');
    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'soon' } });
    await waitFor(() => expect(api.find('GET', '/admin/subjects').some((c) => c.query.get('status') === 'soon')).toBe(true));
  });

  it('a group loads by its key (GET /admin/groups/:key), not by scanning the list', async () => {
    const api = mockApi({ 'GET /admin/groups/:key': (_c, p) => ({ body: rec({ key: p.key, title: L('Естественные науки'), order: 1 }, 4) }) });
    renderAdmin('/admin/groups/science');
    expect((await screen.findAllByDisplayValue('Естественные науки')).length).toBeGreaterThan(0);
    expect(api.find('GET', '/admin/groups/science')).toHaveLength(1);
    expect(api.find('GET', '/admin/groups')).toHaveLength(0);
  });
});

describe('dashboard (A-01)', () => {
  it('asks the server for my drafts, failed builds and the latest publications', async () => {
    const api = mockApi({
      'GET /admin/topics': { body: page([]) },
      'GET /admin/builds': { body: page([{ id: '00000000-0000-4000-8000-0000000000b1', topicKey: 'dna', topicVersionId: '00000000-0000-4000-8000-0000000000b2', version: '1.0.0', status: 'failed', log: ['boom'], createdAt: '2026-10-01T10:00:00.000Z' }]) },
      'GET /admin/strings': { body: page([]) },
    });
    renderAdmin('/admin');
    expect(await screen.findByText('boom')).toBeInTheDocument();
    const topics = api.find('GET', '/admin/topics').map((c) => Object.fromEntries(c.query));
    expect(topics).toContainEqual(expect.objectContaining({ status: 'draft', mine: 'true' }));
    expect(topics).toContainEqual(expect.objectContaining({ status: 'published', sort: 'updatedAt', order: 'desc' }));
    const builds = api.find('GET', '/admin/builds').map((c) => Object.fromEntries(c.query));
    expect(builds.length).toBeGreaterThan(0);
    expect(builds.every((b) => b.status === 'failed')).toBe(true);
    expect(builds).toContainEqual(expect.objectContaining({ sort: 'createdAt', order: 'desc' }));
    expect(screen.getAllByText('Мои черновики').length).toBeGreaterThan(0);
  });
});
