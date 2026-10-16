/** «ИИ-контент» review queue (contract 0.4.0). */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readDraft } from '../lib/draft';
import { mockApi, page, renderAdmin, L } from '../test/utils';
import { itemDraft } from './Generated';
import { packageByKey } from '../../mocks/data';

const oxygen = packageByKey('water')!.concepts.find((c) => c.key === 'chem.oxygen')!;

configure({ asyncUtilTimeout: 5000 });

const ID1 = '0192a000-0000-7000-8000-00000000g001'.replace('g', 'a');
const ID2 = '0192a000-0000-7000-8000-00000000b002';
const quiz = {
  id: ID1,
  kind: 'quiz',
  topicKey: 'water',
  conceptKey: 'chem.oxygen',
  lang: 'ru',
  quiz: { id: ID1, prompt: 'Сколько атомов кислорода в молекуле воды?', options: [{ key: 'a', text: 'Один' }, { key: 'b', text: 'Два' }], answer: 'a', explanation: 'H₂O: один атом кислорода.' },
  status: 'new',
  good: 2,
  bad: 1,
  reasons: { unclear: 1 },
  served: 7,
  createdAt: '2026-10-16T08:00:00.000Z',
};
const example = {
  id: ID2,
  kind: 'simple',
  topicKey: 'water',
  conceptKey: 'chem.oxygen',
  lang: 'ru',
  example: { id: ID2, title: 'Свеча под стаканом', text: 'Свеча гаснет, когда кончается кислород.' },
  status: 'approved',
  good: 0,
  bad: 0,
  reasons: {},
  served: 3,
  createdAt: '2026-10-16T09:00:00.000Z',
};
const concept = {
  id: '0192a000-0000-7000-8000-0000000000c9',
  version: 4,
  updatedAt: '2026-10-15T08:00:00.000Z',
  data: { ...oxygen, examples: { simple: [{ title: L('Огонь'), text: L('Горит') }], stem: [{ title: L('Сварка'), text: L('Кислород') }] } },
};

describe('generated content review', () => {
  it('lists items with ratings and reasons; approve / dismiss send the status', async () => {
    const api = mockApi({
      'GET /admin/generated': { body: page([quiz, example]) },
      'PATCH /admin/generated/:id': { body: { ...quiz, status: 'approved' } },
    });
    renderAdmin('/admin/generated');
    const row = (await screen.findByText(quiz.quiz.prompt)).closest('tr')!;
    expect(within(row).getByText('Непонятно × 1')).toBeInTheDocument();
    expect(within(row).getByText('Новый')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /Одобрить/ }));
    await waitFor(() => expect(api.find('PATCH', `/admin/generated/${ID1}`)[0]?.body).toEqual({ status: 'approved' }));
    const exRow = screen.getByText(example.example.text).closest('tr')!;
    expect(within(exRow).queryByRole('button', { name: /Одобрить/ })).not.toBeInTheDocument();
    fireEvent.click(within(exRow).getByRole('button', { name: /Отклонить/ }));
    await waitFor(() => expect(api.find('PATCH', `/admin/generated/${ID2}`)[0]?.body).toEqual({ status: 'dismissed' }));
  });

  it('filters go to the server', async () => {
    const api = mockApi({ 'GET /admin/generated': { body: page([]) } });
    renderAdmin('/admin/generated?status=new&reported=true');
    await waitFor(() => expect(api.find('GET', '/admin/generated').length).toBeGreaterThan(0));
    const q = api.find('GET', '/admin/generated').at(-1)!.query;
    expect(Object.fromEntries(q as unknown as URLSearchParams)).toMatchObject({ status: 'new', reported: 'true' });
  });

  it('a question moves into the item bank as a prefilled draft; an example into its concept', async () => {
    const api = mockApi({
      'GET /admin/generated': { body: page([quiz, example]) },
      'PATCH /admin/generated/:id': { body: { ...quiz, status: 'promoted' } },
      'GET /admin/concepts/:key': { body: concept },
      'GET /admin/items': { body: page([]) },
      'GET /admin/objectives': { body: page([]) },
      'GET /admin/concepts': { body: page([]) },
    });
    renderAdmin('/admin/generated');
    const row = (await screen.findByText(quiz.quiz.prompt)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /В контент/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/items/new'));
    const draft = itemDraft(quiz as never);
    expect(api.find('PATCH', `/admin/generated/${ID1}`)[0].body).toEqual({ status: 'promoted', promotedTo: `item:${draft.key}` });
    expect(readDraft('items:new')?.value).toMatchObject({ type: 'single', answer: 'a', prompt: { ru: quiz.quiz.prompt, ky: '', en: '' } });
  });

  it('itemDraft: one language filled, a valid key', () => {
    const d = itemDraft(quiz as never);
    expect(d.key).toMatch(/^chem\.oxygen\.gen-[0-9a-f]{6}$/);
    expect(d.type === 'single' && d.options).toEqual([{ key: 'a', text: { ky: '', ru: 'Один', en: '' } }, { key: 'b', text: { ky: '', ru: 'Два', en: '' } }]);
  });

  it('example promotion appends to the concept draft at its version', async () => {
    mockApi({
      'GET /admin/generated': { body: page([example]) },
      'PATCH /admin/generated/:id': { body: { ...example, status: 'promoted' } },
      'GET /admin/concepts/:key': { body: concept },
    });
    renderAdmin('/admin/generated');
    const row = (await screen.findByText(example.example.text)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /В контент/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/concepts/chem.oxygen'));
    const d = readDraft<{ examples: { simple: unknown[] } }>('concepts:chem.oxygen')!;
    expect(d.baseVersion).toBe(4);
    expect(d.value.examples.simple).toHaveLength(2);
    expect(d.value.examples.simple[1]).toEqual({ title: { ky: '', ru: 'Свеча под стаканом', en: '' }, text: { ky: '', ru: example.example.text, en: '' } });
  });
});
