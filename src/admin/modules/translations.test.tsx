import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { highlightTerms } from '../lib/glossary';
import { currentUrl, fail, mockApi, page, rec, renderAdmin, type Call, type Handler } from '../test/utils';

type Loc = 'ru' | 'ky' | 'en';
const row = (key: string, values: Partial<Record<Loc, string>>, status: Partial<Record<Loc, string>>, extra: { versions?: Partial<Record<Loc, number>>; stale?: Loc[] } = {}) => ({
  key,
  values,
  status,
  versions: extra.versions ?? Object.fromEntries(Object.keys(values).map((l) => [l, 1])),
  sourceHash: 'h1',
  sourceChanged: !!extra.stale?.length,
  sourceChangedLocales: extra.stale ?? [],
});
const KEY = 'concept/bio.nucleus/title';
const KEY2 = 'concept/bio.nucleus/description';
const ROW1 = row(KEY, { ru: 'Ядро клетки', ky: 'Клетканын ядросу', en: 'Nucleus' }, { ru: 'reviewed', ky: 'machine', en: 'draft' }, { versions: { ru: 3, ky: 2, en: 1 }, stale: ['ky'] });
const ROW2 = row(KEY2, { ru: 'Ядро хранит ДНК', ky: '', en: '' }, { ru: 'reviewed', ky: 'draft', en: 'draft' });

function setup(routes: Record<string, Handler> = {}) {
  return mockApi({
    'GET /admin/strings/rows': (c: Call) => {
      let items = [ROW1, ROW2];
      // Server semantics: a filter matches when any requested locale matches.
      if (c.query.get('untranslated') === 'true') items = items.filter((r) => Object.values(r.values).some((v) => !v));
      if (c.query.get('sourceChanged') === 'true') items = items.filter((r) => r.sourceChanged);
      const st = c.query.get('status');
      if (st) items = items.filter((r) => Object.values(r.status).includes(st));
      return { body: page(items) };
    },
    'GET /admin/glossary': { body: page([rec({ id: 'nucleus', ky: 'ядро', ru: 'ядро', en: 'nucleus', forbidden: ['нуклеус'] })]) },
    'PATCH /admin/strings': { body: { ok: true } },
    ...routes,
  });
}

describe('A-11 translations', () => {
  it('asks for ru,ky,en rows in one request with the URL filters, search, prefix and sort', async () => {
    const api = setup();
    renderAdmin('/admin/translations?locale=ky&untranslated=true&q=ядро&prefix=concept/&sort=-updatedAt');
    expect(await screen.findByTestId(`row-${KEY2}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`row-${KEY}`)).toBeNull();
    const calls = api.find('GET', '/admin/strings/rows');
    expect(api.find('GET', '/admin/strings')).toHaveLength(0);
    const q = calls[calls.length - 1].query;
    expect(Object.fromEntries(q)).toMatchObject({ locales: 'ru,ky,en', untranslated: 'true', q: 'ядро', prefix: 'concept/', sort: 'updatedAt', order: 'desc' });
    expect(q.has('sourceChanged')).toBe(false);

    fireEvent.click(screen.getByLabelText('Не переведено'));
    await waitFor(() => expect(currentUrl().searchParams.has('untranslated')).toBe(false));
    expect(await screen.findByTestId(`row-${KEY}`)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Изменился источник'));
    await waitFor(() => expect(currentUrl().searchParams.get('sourceChanged')).toBe('true'));
    await waitFor(() => expect(screen.queryByTestId(`row-${KEY2}`)).toBeNull());
    const r = screen.getByTestId(`row-${KEY}`);
    expect(within(r).getByText('источник изменился: ky')).toBeInTheDocument();
    expect(within(r).getByText('машинный черновик')).toBeInTheDocument();
  });

  it('applies status / untranslated to the target locale only, and says how many rows it hid', async () => {
    setup();
    // ROW1 has en = draft but ky = machine: the server returns it for status=draft (any locale), the page hides it for ky.
    renderAdmin('/admin/translations?locale=ky&status=draft');
    expect(await screen.findByTestId(`row-${KEY2}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`row-${KEY}`)).toBeNull();
    expect(screen.getByText(/скрыто строк: 1/)).toBeInTheDocument();
  });

  it('shows ru → ky → en side by side, highlights glossary terms and flags forbidden variants', async () => {
    setup();
    renderAdmin('/admin/translations');
    const r = await screen.findByTestId(`row-${KEY}`);
    expect(within(r).getByDisplayValue('Nucleus')).toBeInTheDocument();
    expect(within(r).getByDisplayValue('Ядро клетки')).toBeInTheDocument();
    expect(within(r).getByDisplayValue('Клетканын ядросу')).toBeInTheDocument();
    await waitFor(() => expect(r.querySelector('mark.adm-term')).toHaveTextContent('Ядро'));
    fireEvent.change(within(r).getByLabelText(`${KEY} — ky`), { target: { value: 'нуклеус клетки' } });
    expect(within(r).getByText('Запрещённый вариант «нуклеус», используйте «ядро»')).toBeInTheDocument();
  });

  it('saves edits and bulk «проверено» through one PATCH, with row versions and the source hash', async () => {
    const api = setup();
    renderAdmin('/admin/translations?locale=ky');
    await screen.findByTestId(`row-${KEY2}`);
    fireEvent.change(screen.getByLabelText(`${KEY2} — ky`), { target: { value: 'Ядро ДНКны сактайт' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }));
    await waitFor(() => expect(api.find('PATCH', '/admin/strings')).toHaveLength(1));
    expect(api.find('PATCH', '/admin/strings')[0].body).toEqual({ items: [{ key: KEY2, locale: 'ky', value: 'Ядро ДНКны сактайт', status: 'draft', version: 1, sourceHash: 'h1' }] });

    fireEvent.click(screen.getByLabelText(`Выбрать ${KEY}`));
    fireEvent.click(screen.getByRole('button', { name: 'Отметить проверенным (1)' }));
    await waitFor(() => expect(api.find('PATCH', '/admin/strings')).toHaveLength(2));
    expect(api.find('PATCH', '/admin/strings')[1].body).toEqual({ items: [{ key: KEY, locale: 'ky', value: 'Клетканын ядросу', status: 'reviewed', version: 2, sourceHash: 'h1' }] });
  });

  it('a source edit carries only the version (no source-hash precondition)', async () => {
    const api = setup();
    renderAdmin('/admin/translations?locale=ky');
    await screen.findByTestId(`row-${KEY}`);
    fireEvent.change(screen.getByLabelText(`${KEY} — ru`), { target: { value: 'Ядро' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }));
    await waitFor(() => expect(api.find('PATCH', '/admin/strings')).toHaveLength(1));
    expect(api.find('PATCH', '/admin/strings')[0].body).toEqual({ items: [{ key: KEY, locale: 'ru', value: 'Ядро', status: 'reviewed', version: 3 }] });
  });

  it('409 keeps the edits, marks the stale cell and lets the editor take theirs or keep mine', async () => {
    let fresh = false;
    let patches = 0;
    const api = setup({
      'GET /admin/strings/rows': () => ({ body: page(fresh ? [{ ...ROW2, values: { ...ROW2.values, ky: 'Чужой перевод' }, versions: { ...ROW2.versions, ky: 2 } }] : [ROW2]) }),
      'PATCH /admin/strings': () => {
        patches++;
        if (patches === 1) {
          fresh = true;
          return fail('version_mismatch', { detail: `${KEY2} (ky): version 2` });
        }
        return { body: { ok: true } };
      },
    });
    renderAdmin('/admin/translations?locale=ky');
    await screen.findByTestId(`row-${KEY2}`);
    fireEvent.change(screen.getByLabelText(`${KEY2} — ky`), { target: { value: 'Менин котормом' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }));
    const stale = await screen.findByTestId(`stale-${KEY2}-ky`);
    expect(screen.getByRole('alert')).toHaveTextContent('Конфликтующих ячеек: 1');
    expect(within(stale).getByText('Сейчас на сервере: «Чужой перевод»')).toBeInTheDocument();
    expect(screen.getByLabelText(`${KEY2} — ky`)).toHaveValue('Менин котормом');

    fireEvent.click(within(stale).getByRole('button', { name: 'Оставить мою' }));
    expect(screen.queryByTestId(`stale-${KEY2}-ky`)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }));
    await waitFor(() => expect(api.find('PATCH', '/admin/strings')).toHaveLength(2));
    expect(api.find('PATCH', '/admin/strings')[1].body).toEqual({ items: [{ key: KEY2, locale: 'ky', value: 'Менин котормом', status: 'draft', version: 2, sourceHash: 'h1' }] });
  });

  it('«взять их» drops the stale edit', async () => {
    let fresh = false;
    setup({
      'GET /admin/strings/rows': () => ({ body: page(fresh ? [{ ...ROW2, values: { ...ROW2.values, ky: 'Чужой перевод' }, versions: { ...ROW2.versions, ky: 2 } }] : [ROW2]) }),
      'PATCH /admin/strings': () => {
        fresh = true;
        return fail('version_mismatch');
      },
    });
    renderAdmin('/admin/translations?locale=ky');
    await screen.findByTestId(`row-${KEY2}`);
    fireEvent.change(screen.getByLabelText(`${KEY2} — ky`), { target: { value: 'Менин котормом' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }));
    const stale = await screen.findByTestId(`stale-${KEY2}-ky`);
    fireEvent.click(within(stale).getByRole('button', { name: 'Взять их версию' }));
    expect(screen.getByLabelText(`${KEY2} — ky`)).toHaveValue('Чужой перевод');
    expect(screen.getByRole('button', { name: 'Сохранить изменения (0)' })).toBeDisabled();
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
