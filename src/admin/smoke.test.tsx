/**
 * Every admin route renders against contract-valid fixtures (the animal-cell
 * package) without crashing, and the key screen content shows up.
 */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { animalCellPackage as pkg } from '@bilig/content-model/fixtures/animal-cell';
import { setPreviewBridge, setPreviewRenderer } from './lib/preview-bridge';
import { mockApi, page, rec, renderAdmin, type Handler } from './test/utils';

// These flows render whole admin pages; under a full parallel run the 1 s default is too tight.
configure({ asyncUtilTimeout: 5000 });

const TOPIC_ID = '00000000-0000-4000-8000-000000000006';
const VERSION_ID = '00000000-0000-4000-8000-000000000002';
const SCHOOL_ID = '00000000-0000-4000-8000-000000000003';
const USER_ID = '00000000-0000-4000-8000-000000000004';
const ASSET_ID = '00000000-0000-4000-8000-000000000005';
const now = '2026-10-15T10:00:00.000Z';

const topicRow = { id: TOPIC_ID, key: pkg.topic.key, unitKey: pkg.topic.unitKey, status: 'review' as const, publishedVersion: '1.0.0', latestVersion: '1.1.0', updatedAt: now, version: 5 };
const detail = { ...topicRow, demo: false, subjectKey: pkg.subject.key, availableActions: ['reject', 'approve', 'publish'] };
const version = { id: VERSION_ID, topicKey: pkg.topic.key, version: '1.1.0', doc: pkg.topic, authorId: USER_ID, createdAt: now, reviewState: 'review' };
const checklist = { schema: true, translations: false, budgets: true, altText: true, issues: [{ path: ['topic', 'title', 'en'], code: 'i18n_missing', message: 'missing en', severity: 'warning' }] };
const school = { id: SCHOOL_ID, name: 'Школа №1', region: 'Бишкек', type: 'state', language: 'ky', status: 'active' };
const user = { id: USER_ID, kind: 'adult', displayName: 'Айгуль', email: 'a@school.kg', status: 'active', grants: [{ role: 'teacher', scope: 'school', scopeId: SCHOOL_ID }] };
const asset = { id: ASSET_ID, key: 'animal-cell-000005', status: 'ready', sizeBefore: 4_000_000, sizeAfter: 1_500_000, triangles: 120000, nodes: ['Cell/Nucleus', 'Cell/Mito_1'], violations: [] };
const tutor = {
  enabled: true,
  provider: 'anthropic',
  model: 'claude-x',
  systemPrompts: { ky: '', ru: '', en: '' },
  limits: { guestPerHour: 5, studentPerHour: 30, adultPerHour: 60, ipPerHour: 100, schoolPerDay: 2000 },
  dailyTokenBudget: 1_000_000,
  stopTopics: ['политика'],
  regressionQuestions: [],
  version: 2,
};
const analytics = {
  from: '2026-09-15T00:00:00.000Z',
  to: '2026-10-15T00:00:00.000Z',
  activeSchools: 2,
  activeStudents: 40,
  attempts: 120,
  events: 900,
  daily: [{ date: '2026-10-14', events: 30, attempts: 4 }, { date: '2026-10-15', events: 50, attempts: 6 }],
  bySchool: [{ key: SCHOOL_ID, count: 100 }],
  byRegion: [{ key: 'Бишкек', count: 100 }],
  popularTopics: [{ key: 'animal-cell', count: 300 }],
  popularConcepts: [{ key: 'bio.nucleus', count: 80 }],
  hardestItems: [{ itemKey: 'q1', answers: 10, correctRate: 0.3, commonWrong: 'b', avgTimeMs: 5000 }],
  tutor: { questions: 50, refused: 2, inputTokens: 1000, outputTokens: 2000, unanswered: [{ topicKey: 'animal-cell', text: 'Почему ядро?', ts: now }] },
};

function api(extra: Record<string, Handler> = {}) {
  const list = (items: unknown[]) => ({ body: page(items) });
  return mockApi({
    'GET /admin/topics': list([topicRow]),
    'GET /admin/topics/:id': { body: detail },
    'GET /admin/topics/:id/versions': { body: { items: [{ ...version, doc: undefined }].map(({ doc: _d, ...v }) => v) } },
    'GET /admin/topics/:id/versions/:v': { body: version },
    'GET /admin/topics/:id/checklist': { body: checklist },
    'GET /admin/topics/:id/diff': { body: { from: '1.0.0', to: '1.1.0', changes: [{ path: ['title', 'ru'], kind: 'changed', before: 'a', after: 'b' }] } },
    'GET /admin/subjects': list([rec(pkg.subject)]),
    'GET /admin/subjects/:key': { body: rec(pkg.subject) },
    'GET /admin/groups': list([]),
    'GET /admin/courses': list(pkg.course ? [rec(pkg.course)] : []),
    'GET /admin/units': list(pkg.unit ? [rec(pkg.unit)] : []),
    'GET /admin/objectives': list((pkg.objectives ?? []).map((o) => rec(o))),
    'GET /admin/concepts': list(pkg.concepts.map((c) => rec(c))),
    'GET /admin/concepts/:key': (_c, p) => {
      const c = pkg.concepts.find((x) => x.key === p.key);
      return c ? { body: rec(c) } : { status: 404, body: { type: 'x', title: 'nf', status: 404, code: 'not_found', i18nKey: 'errors.not_found' } };
    },
    'GET /admin/concepts/:key/usage': (_c, p) => ({ body: { conceptKey: p.key, topicKeys: ['animal-cell'] } }),
    'GET /admin/processes': list(pkg.processes.map((p) => rec(p))),
    'GET /admin/processes/:key': (_c, p) => ({ body: rec(pkg.processes.find((x) => x.key === p.key) ?? pkg.processes[0]) }),
    'GET /admin/items': list(pkg.items.map((i) => rec(i))),
    'GET /admin/items/:key': (_c, p) => ({ body: rec(pkg.items.find((x) => x.key === p.key) ?? pkg.items[0]) }),
    'GET /admin/items/:key/stats': (_c, p) => ({ body: { itemKey: p.key, answers: 10, correctRate: 0.5, commonWrong: 'x', avgTimeMs: 3000 } }),
    'GET /admin/glossary': list(pkg.glossary.map((g) => rec(g))),
    'GET /admin/strings': list([]),
    'GET /admin/builds': list([{ id: VERSION_ID, topicKey: 'animal-cell', topicVersionId: VERSION_ID, version: '1.0.0', status: 'failed', log: ['boom'], createdAt: now }]),
    'GET /admin/assets': list([asset]),
    'GET /admin/assets/:id': { body: asset },
    'GET /admin/schools': list([school]),
    'GET /admin/schools/:id': { body: school },
    'GET /admin/licenses': list([{ id: VERSION_ID, schoolId: SCHOOL_ID, subjects: ['bio'], grades: [7], seats: 30, startsAt: now, endsAt: '2027-10-15T10:00:00.000Z' }]),
    'GET /admin/users': list([user]),
    'GET /admin/users/:id': { body: user },
    'GET /admin/invites': list([]),
    'GET /admin/analytics/overview': { body: analytics },
    'GET /admin/tutor-settings': { body: tutor },
    'GET /admin/audit': list([{ id: VERSION_ID, actorId: USER_ID, action: 'content.updated', targetType: 'topic', targetId: TOPIC_ID, diff: { version: '1.1.0' }, ts: now }]),
    'GET /admin/tours/:topicKey': { body: { topicKey: 'animal-cell', tour: pkg.topic.activities.tour ?? null, version: '1.1.0' } },
    ...extra,
  });
}

const ROUTES: [string, string | RegExp][] = [
  ['/admin', 'Ожидают проверки'],
  ['/admin/subjects', pkg.subject.key],
  ['/admin/subjects/new', 'Предметы · новая запись'],
  ['/admin/subjects/' + pkg.subject.key, 'Тёмная тема'],
  ['/admin/groups', 'Группы предметов'],
  ['/admin/programme', 'Импорт целей из CSV'],
  ['/admin/courses', 'Курсы'],
  ['/admin/units', 'Разделы'],
  ['/admin/objectives', 'Цели обучения'],
  ['/admin/concepts', pkg.concepts[0].key],
  ['/admin/concepts/' + pkg.concepts[0].key, 'Где используется'],
  ['/admin/assets', 'Загрузка ассета'],
  ['/admin/assets/' + ASSET_ID, 'Дерево узлов'],
  ['/admin/topics', 'animal-cell'],
  ['/admin/topics/new', 'Темы · новая запись'],
  ['/admin/topics/' + TOPIC_ID, 'Предпросмотр'],
  ['/admin/topics/' + TOPIC_ID + '/tour', /Добавить шаг/],
  ['/admin/topics/' + TOPIC_ID + '/comparison', 'Строки (свойства)'],
  ['/admin/processes', 'Процессы'],
  ...(pkg.processes[0] ? ([['/admin/processes/' + pkg.processes[0].key, 'Проигрывание']] as [string, string][]) : []),
  ['/admin/items', 'Банк заданий'],
  ...(pkg.items[0] ? ([['/admin/items/' + pkg.items[0].key, 'Статистика ответов']] as [string, string][]) : []),
  ['/admin/translations', 'Язык перевода'],
  ['/admin/glossary', 'Глоссарий'],
  ['/admin/publishing', 'animal-cell'],
  ['/admin/publishing/' + TOPIC_ID, 'Чек-лист перед публикацией'],
  ['/admin/review', 'animal-cell'],
  ['/admin/review/' + TOPIC_ID, 'Вернуть на доработку'],
  ['/admin/schools', 'Школа №1'],
  ['/admin/schools/' + SCHOOL_ID, 'Лицензии'],
  ['/admin/users', 'Айгуль'],
  ['/admin/users/' + USER_ID, 'Сбросить 2FA'],
  ['/admin/analytics', 'Вопросы без ответа'],
  ['/admin/tutor', 'Стоп-темы'],
  ['/admin/audit', 'content.updated'],
];

describe('route smoke test', () => {
  it.each(ROUTES)('%s renders', async (path, text) => {
    api();
    renderAdmin(path);
    expect((await screen.findAllByText(text, {}, { timeout: 3000 })).length).toBeGreaterThan(0);
  });
});

describe('A-06 topic editor', () => {
  it('shows tabs, renders the package preview with concepts in the chosen language and saves a version with If-Match + basedOn', async () => {
    const m = api({
      'POST /admin/topics/:id/versions': (c) => ({ body: { ...version, version: '1.2.0', doc: (c.body as { doc: unknown }).doc } }),
    });
    renderAdmin('/admin/topics/' + TOPIC_ID);
    await screen.findByText('Предпросмотр');
    for (const tab of ['Основное', 'Сцена', 'Структуры', 'Активности', 'Тексты', 'Права и источники']) expect(screen.getByRole('tab', { name: new RegExp(tab) })).toBeInTheDocument();
    const firstConcept = pkg.concepts.find((c) => pkg.topic.conceptKeys.includes(c.key))!;
    await waitFor(() => expect(screen.getAllByText(firstConcept.title.ky).length).toBeGreaterThan(0));
    fireEvent.click(within(screen.getByRole('group', { name: 'Язык контента' })).getByRole('button', { name: 'ru' }));
    await waitFor(() => expect(screen.getAllByText(firstConcept.title.ru).length).toBeGreaterThan(0));
    expect(screen.getByTestId('viewer-slot')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Длительность, мин'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(m.find('POST', `/admin/topics/${TOPIC_ID}/versions`)).toHaveLength(1));
    const post = m.find('POST', `/admin/topics/${TOPIC_ID}/versions`)[0];
    expect(post.headers['if-match']).toBe('"5"');
    expect(post.body).toMatchObject({ basedOn: '1.1.0', doc: { durationMin: 45, status: 'draft' } });

    fireEvent.click(screen.getByRole('tab', { name: /Активности/ }));
    expect(screen.getAllByText('Тур').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Сравнение').length).toBeGreaterThan(0);
  });

  it('a registered 3D renderer replaces the placeholder (extension point)', async () => {
    api();
    setPreviewRenderer(({ pkg: p, lang }) => <div data-testid="viewer">{`${p.topic.key}:${lang}`}</div>);
    try {
      renderAdmin('/admin/topics/' + TOPIC_ID);
      expect(await screen.findByTestId('viewer')).toHaveTextContent('animal-cell:ky');
    } finally {
      setPreviewRenderer(null);
    }
  });
});

describe('A-07 tour editor', () => {
  it('reorders steps by drag and drop and PUTs the tour with If-Match', async () => {
    const steps = pkg.topic.activities.tour?.steps ?? [];
    if (steps.length < 2) return;
    const m = api({ 'PUT /admin/tours/:topicKey': { body: version } });
    setPreviewBridge({});
    renderAdmin('/admin/topics/' + TOPIC_ID + '/tour');
    const first = await screen.findByTestId('step-0');
    const second = screen.getByTestId('step-1');
    const data = new Map<string, string>();
    const dt = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '' };
    fireEvent.dragStart(first, { dataTransfer: dt });
    fireEvent.dragOver(second, { dataTransfer: dt });
    fireEvent.drop(second, { dataTransfer: dt });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(m.find('PUT', '/admin/tours/animal-cell')).toHaveLength(1));
    const put = m.find('PUT', '/admin/tours/animal-cell')[0];
    expect(put.headers['if-match']).toBe('"5"');
    expect((put.body as { tour: { steps: { key: string }[] } }).tour.steps.map((s) => s.key).slice(0, 2)).toEqual([steps[1].key, steps[0].key]);
  });
});

describe('A-13 publishing', () => {
  it('only permitted workflow actions are offered; publish can be scheduled', async () => {
    const m = api({ 'POST /admin/topics/:id/publish': { body: { topicKey: 'animal-cell', status: 'review', version: '1.1.0', scheduledAt: '2026-11-01T06:00:00.000Z' } } });
    renderAdmin('/admin/publishing/' + TOPIC_ID);
    await screen.findByText('Чек-лист перед публикацией');
    expect(await screen.findByRole('button', { name: 'Вернуть на доработку' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить на проверку' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    fireEvent.change(screen.getByLabelText('Опубликовать в (необязательно)'), { target: { value: '2026-11-01T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(m.find('POST', `/admin/topics/${TOPIC_ID}/publish`)).toHaveLength(1));
    expect((m.find('POST', `/admin/topics/${TOPIC_ID}/publish`)[0].body as { scheduledAt: string }).scheduledAt).toMatch(/^2026-11-01T\d\d:00:00\.000Z$/);
    expect(await screen.findByText('изменено')).toBeInTheDocument();
  });
});
