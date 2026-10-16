/** A-18 tutor regression run and A-19 audit filters (contract 0.3.0). */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dayToIso } from './Ops';
import { fail, mockApi, page, renderAdmin } from '../test/utils';

configure({ asyncUtilTimeout: 5000 });

const settings = {
  enabled: true,
  provider: 'anthropic',
  model: 'claude-x',
  systemPrompts: { ky: '', ru: '', en: '' },
  limits: { guestPerHour: 5, studentPerHour: 30, adultPerHour: 60, ipPerHour: 100, schoolPerDay: 2000 },
  dailyTokenBudget: 1_000_000,
  stopTopics: [],
  regressionQuestions: [
    { lang: 'ru', question: 'Что такое ядро?', expectConcepts: ['bio.nucleus'] },
    { lang: 'ky', question: 'Митохондрия деген эмне?', topicKey: 'animal-cell', expectConcepts: ['bio.mitochondrion'] },
  ],
  version: 3,
};

const item = (index: number, extra: Record<string, unknown>) => ({
  index,
  lang: settings.regressionQuestions[index].lang,
  question: settings.regressionQuestions[index].question,
  answer: 'Ответ',
  citations: [],
  expectConcepts: settings.regressionQuestions[index].expectConcepts,
  missing: [],
  passed: false,
  refused: false,
  noAnswer: false,
  inputTokens: 100,
  outputTokens: 20,
  ...extra,
});

describe('tutor regression run (A-18)', () => {
  it('runs the selected saved questions with a default topic and shows per-question results', async () => {
    const api = mockApi({
      'GET /admin/tutor-settings': { body: settings },
      'POST /admin/tutor-settings/regression': {
        body: {
          ranAt: '2026-10-16T08:00:00.000Z',
          model: 'claude-x',
          passed: 1,
          failed: 1,
          items: [
            item(0, { citations: ['bio.nucleus'], passed: true }),
            item(1, { topicKey: 'animal-cell', missing: ['bio.mitochondrion'] }),
          ],
        },
      },
    });
    renderAdmin('/admin/tutor');
    await screen.findByText('Регрессия ответов');
    expect(screen.getByRole('button', { name: /вопросов: 2/ })).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Выбрать вопрос 2'));
    fireEvent.click(screen.getByLabelText('Выбрать вопрос 1'));
    fireEvent.change(screen.getByLabelText('Тема по умолчанию'), { target: { value: 'animal-cell' } });
    fireEvent.click(screen.getByRole('button', { name: /вопросов: 2/ }));

    const results = await screen.findByRole('region', { name: 'Результаты прогона' });
    expect(api.find('POST', '/admin/tutor-settings/regression')[0].body).toEqual({ topicKey: 'animal-cell', indexes: [0, 1] });
    expect(within(results).getByText('Прошло: 1 · не прошло: 1')).toBeInTheDocument();
    expect(within(results).getByText('прошёл')).toBeInTheDocument();
    expect(within(results).getByText('не прошёл')).toBeInTheDocument();
    expect(within(results).getByText('bio.mitochondrion')).toBeInTheDocument();
  });

  it('runs all questions without a body and explains a 503 without a provider', async () => {
    const api = mockApi({
      'GET /admin/tutor-settings': { body: settings },
      'POST /admin/tutor-settings/regression': fail('tutor_unavailable', { detail: 'offline' }),
    });
    renderAdmin('/admin/tutor');
    fireEvent.click(await screen.findByRole('button', { name: /вопросов: 2/ }));
    expect(await screen.findByText(/не настроен провайдер/)).toBeInTheDocument();
    expect(api.find('POST', '/admin/tutor-settings/regression')[0].body).toEqual({});
  });

});

describe('audit log filters (A-19)', () => {
  it('local days become an instant range ([from, to+1d)), target id and actor prefix go to the server', async () => {
    const api = mockApi({ 'GET /admin/audit': { body: page([]) } });
    renderAdmin('/admin/audit?from=2026-10-01&to=2026-10-02&targetId=animal-cell&actorId=0123');
    await waitFor(() => expect(api.find('GET', '/admin/audit').length).toBeGreaterThan(0));
    const q = api.find('GET', '/admin/audit')[0].query;
    expect(q.get('from')).toBe(dayToIso('2026-10-01'));
    expect(q.get('to')).toBe(dayToIso('2026-10-03'));
    expect([q.get('targetId'), q.get('actorId')]).toEqual(['animal-cell', '0123']);
    expect(screen.getByLabelText('С')).toHaveValue('2026-10-01');

    fireEvent.click(screen.getByRole('button', { name: /Когда/ }));
    await waitFor(() => {
      const last = api.find('GET', '/admin/audit').at(-1)!.query;
      expect([last.get('sort'), last.get('order')]).toEqual(['ts', 'asc']);
    });
  });

  it('ignores a malformed day instead of sending it', () => {
    expect(dayToIso('2026-13')).toBeUndefined();
    expect(dayToIso(undefined)).toBeUndefined();
    expect(new Date(dayToIso('2026-10-01', true)!).getTime() - new Date(dayToIso('2026-10-01')!).getTime()).toBeGreaterThanOrEqual(23 * 3600_000);
  });
});
