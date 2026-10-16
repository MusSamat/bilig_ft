import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { highlightTerms } from '../lib/glossary';
import { currentUrl, mockApi, page, rec, renderAdmin, type Call } from '../test/utils';

const row = (key: string, locale: string, value: string, status = 'draft', sourceChanged = false) => ({ key, locale, value, status, sourceHash: 'h', sourceChanged });
const KEY = 'concept/bio.nucleus/title';
const KEY2 = 'concept/bio.nucleus/description';

function setup() {
  return mockApi({
    'GET /admin/strings': (c: Call) => {
      const loc = c.query.get('locale');
      if (loc === 'ru') return { body: page([row(KEY, 'ru', 'Ядро клетки'), row(KEY2, 'ru', 'Ядро хранит ДНК')]) };
      if (loc === 'en') return { body: page([row(KEY, 'en', 'Nucleus'), row(KEY2, 'en', '')]) };
      const items = [row(KEY, 'ky', 'Клетканын ядросу', 'machine', true), row(KEY2, 'ky', '', 'draft')];
      const filtered = items.filter((r) => (c.query.get('untranslated') === 'true' ? !r.value : true)).filter((r) => (c.query.get('sourceChanged') === 'true' ? r.sourceChanged : true));
      return { body: page(filtered) };
    },
    'GET /admin/glossary': { body: page([rec({ id: 'nucleus', ky: 'ядро', ru: 'ядро', en: 'nucleus', forbidden: ['нуклеус'] })]) },
    'PATCH /admin/strings': { body: { ok: true } },
  });
}

describe('A-11 translations', () => {
  it('maps URL filters to the strings query, and toggling a filter updates URL + request', async () => {
    const api = setup();
    renderAdmin('/admin/translations?locale=ky&untranslated=true');
    expect(await screen.findByTestId(`row-${KEY2}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`row-${KEY}`)).toBeNull();
    const main = api.find('GET', '/admin/strings').find((c) => c.query.get('locale') === 'ky')!;
    expect(main.query.get('untranslated')).toBe('true');
    expect(main.query.has('sourceChanged')).toBe(false);

    fireEvent.click(screen.getByLabelText('Не переведено'));
    await waitFor(() => expect(currentUrl().searchParams.has('untranslated')).toBe(false));
    expect(await screen.findByTestId(`row-${KEY}`)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Изменился источник'));
    await waitFor(() => expect(currentUrl().searchParams.get('sourceChanged')).toBe('true'));
    await waitFor(() => expect(api.find('GET', '/admin/strings').some((c) => c.query.get('locale') === 'ky' && c.query.get('sourceChanged') === 'true')).toBe(true));
    await waitFor(() => expect(screen.queryByTestId(`row-${KEY2}`)).toBeNull());
    const r = screen.getByTestId(`row-${KEY}`);
    expect(within(r).getByText('источник изменился')).toBeInTheDocument();
    expect(within(r).getByText('машинный черновик')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'machine' } });
    await waitFor(() => expect(currentUrl().searchParams.get('status')).toBe('machine'));
    await waitFor(() => expect(api.find('GET', '/admin/strings').some((c) => c.query.get('locale') === 'ky' && c.query.get('status') === 'machine')).toBe(true));
  });

  it('shows ru → ky → en side by side, highlights glossary terms and flags forbidden variants', async () => {
    setup();
    renderAdmin('/admin/translations');
    const r = await screen.findByTestId(`row-${KEY}`);
    await waitFor(() => expect(within(r).getByDisplayValue('Nucleus')).toBeInTheDocument());
    expect(within(r).getByDisplayValue('Ядро клетки')).toBeInTheDocument();
    expect(within(r).getByDisplayValue('Клетканын ядросу')).toBeInTheDocument();
    await waitFor(() => expect(r.querySelector('mark.adm-term')).toHaveTextContent('Ядро'));
    fireEvent.change(within(r).getByLabelText(`${KEY} — ky`), { target: { value: 'нуклеус клетки' } });
    expect(within(r).getByText('Запрещённый вариант «нуклеус», используйте «ядро»')).toBeInTheDocument();
  });

  it('saves edits and bulk «проверено» through one PATCH', async () => {
    const api = setup();
    renderAdmin('/admin/translations?locale=ky');
    await screen.findByTestId(`row-${KEY2}`);
    fireEvent.change(screen.getByLabelText(`${KEY2} — ky`), { target: { value: 'Ядро ДНКны сактайт' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }));
    await waitFor(() => expect(api.find('PATCH', '/admin/strings')).toHaveLength(1));
    expect(api.find('PATCH', '/admin/strings')[0].body).toEqual({ items: [{ key: KEY2, locale: 'ky', value: 'Ядро ДНКны сактайт', status: 'draft' }] });

    fireEvent.click(screen.getByLabelText(`Выбрать ${KEY}`));
    fireEvent.click(screen.getByRole('button', { name: 'Отметить проверенным (1)' }));
    await waitFor(() => expect(api.find('PATCH', '/admin/strings')).toHaveLength(2));
    expect(api.find('PATCH', '/admin/strings')[1].body).toEqual({ items: [{ key: KEY, locale: 'ky', value: 'Клетканын ядросу', status: 'reviewed' }] });
  });
});

describe('glossary highlighting', () => {
  const terms = [
    { id: 'a', ky: 'ядро', ru: 'ядро', en: 'nucleus', forbidden: [] },
    { id: 'b', ky: 'клетка', ru: 'клетка', en: 'cell', forbidden: [] },
    { id: 'c', ky: 'ядро клетки', ru: 'ядро клетки', en: 'cell nucleus', forbidden: [] },
  ];
  it('marks terms case-insensitively, longest match wins, not inside other words', () => {
    const segs = highlightTerms('Ядро клетки и подъядро', terms, 'ru');
    expect(segs.filter((s) => s.term).map((s) => [s.text, s.term!.id])).toEqual([['Ядро клетки', 'c']]);
  });
  it('allows inflected endings', () => {
    expect(highlightTerms('клеткалардын', terms, 'ky').find((s) => s.term)?.text).toBe('клетка');
  });
});
