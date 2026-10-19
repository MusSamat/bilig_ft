import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, KTP_MAX_BYTES, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { loginAdult } from '../api/session';
import { renderPage, resetSession } from '../cabinet/testUtils';
import { KTP_ID, TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
import fixture from '../mocks/content/ktp-plan.json';
import TeacherPage from '../pages/TeacherPage';
import { useUi } from '../state/ui';
import KtpPlanPage from './KtpPlanPage';

interface Seen {
  method: string;
  url: URL;
  ifMatch: string | null;
  body: unknown;
}

/** Record every КТП request the page sends (method, URL, If-Match, JSON body). */
function spy(): Seen[] {
  const log: Seen[] = [];
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${API_PREFIX}/ktp`)) return;
    const entry: Seen = { method: request.method, url, ifMatch: request.headers.get('If-Match'), body: null };
    log.push(entry);
    if (request.method === 'POST' || request.method === 'PATCH') void request.clone().json().then((b) => (entry.body = b));
  });
  return log;
}

const saved: string[] = [];
beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
  localStorage.clear();
  saved.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const openPlan = async () => {
  renderPage(`/en/teacher/ktp/${KTP_ID}`, '/:lang/teacher/ktp/:id', <KtpPlanPage />);
  return screen.findByRole('heading', { level: 1 }, { timeout: 5000 });
};

describe('КТП: teacher section and upload', () => {
  it('adds a «Lesson plans» section to the teacher dashboard with the plan list', async () => {
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    await user.click(await screen.findByRole('tab', { name: 'Lesson plans' }));
    const link = await screen.findByRole('link', { name: `Open “${fixture.meta.title}”` });
    const item = link.closest('li')!;
    expect(within(item).getByText(/138 lessons/)).toBeInTheDocument();
    expect(within(item).getByText(/classes 8б, 8в/)).toBeInTheDocument();
    expect(within(item).getByText('1 error')).toBeInTheDocument();
    expect(within(item).getByText(/warnings$/)).toBeInTheDocument();

    // Delete with a confirmation step.
    await user.click(within(item).getByRole('button', { name: `Delete “${fixture.meta.title}”` }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/No KTPs yet/)).toBeInTheDocument();
  });

  it('checks the file on the client, then uploads it as base64 and opens the plan', async () => {
    const log = spy();
    renderPage('/en/teacher?tab=ktp', '/:lang/teacher', <TeacherPage />);
    const input = (await screen.findByLabelText('KTP file (.docx)')) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/This is not a .docx file/)).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(KTP_MAX_BYTES + 1)], 'big.docx')] } });
    expect(await screen.findByText('The file is larger than 4 MB.')).toBeInTheDocument();
    expect(log.filter((r) => r.method === 'POST')).toHaveLength(0);

    fireEvent.change(input, { target: { files: [new File(['PK-docx'], 'КТП алгебра.docx')] } });
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
    const post = log.find((r) => r.method === 'POST')!;
    await waitFor(() => expect(post.body).toEqual({ fileName: 'КТП алгебра.docx', data: btoa('PK-docx') }));
  });

  it('shows the server error of an upload', async () => {
    server.use(http.post(`${API_PREFIX}/ktp`, () => HttpResponse.json(problem('payload_too_large'), { status: 413 })));
    renderPage('/en/teacher?tab=ktp', '/:lang/teacher', <TeacherPage />);
    const input = await screen.findByLabelText('KTP file (.docx)');
    fireEvent.change(input, { target: { files: [new File(['PK'], 'ktp.docx')] } });
    expect(await screen.findByText('The file is too large')).toBeInTheDocument();
  });
});

describe('КТП: plan page', () => {
  it('groups lessons by section, flags section hours and plan-level issues', async () => {
    await openPlan();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Сан')).toBeInTheDocument();
    expect(within(table).getByText('Кайталоо')).toBeInTheDocument();
    expect(within(table).getByText('The section is declared as 8 h, but its lessons take 11 h')).toBeInTheDocument();
    expect(screen.getByText('The header says 136 hours, but the lessons add up to 138')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: /^Download the plan of lesson \d+ for 8б/ })).toHaveLength(138);
  });

  it('switches the class (dates, issues) and remembers it', async () => {
    const user = userEvent.setup();
    await openPlan();
    expect(screen.getByLabelText('Date of lesson 2 for 8б')).toHaveValue('2026-09-17');
    expect(screen.queryByRole('img', { name: 'Non-existent date: 31.04.27' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '8в' }));
    expect(screen.getByLabelText('Date of lesson 2 for 8в')).toHaveValue('2026-09-16');
    expect(screen.getByRole('img', { name: 'Non-existent date: 31.04.27' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date of lesson 109 for 8в')).toHaveAttribute('aria-invalid', 'true');
    expect(localStorage.getItem(`bilig.ktp.class.${KTP_ID}`)).toBe('8в');

    // «Only problems» keeps the lessons with an error or a warning for this class.
    await user.click(screen.getByLabelText('Only problems'));
    expect(screen.getByLabelText('Date of lesson 109 for 8в')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date of lesson 2 for 8в')).not.toBeInTheDocument();
  });

  it('localizes issue messages per code (ky, ru)', async () => {
    await i18n.changeLanguage('ky');
    const user = userEvent.setup();
    renderPage(`/ky/teacher/ktp/${KTP_ID}`, '/:lang/teacher/ktp/:id', <KtpPlanPage />);
    await user.click(await screen.findByRole('button', { name: '8в' }, { timeout: 5000 }));
    expect(screen.getByRole('img', { name: 'Мындай күн жок: 31.04.27' })).toBeInTheDocument();
    await i18n.changeLanguage('ru');
    expect(await screen.findByRole('img', { name: 'Несуществующая дата: 31.04.27' })).toBeInTheDocument();
  });

  it('sends inline edits as PATCH with If-Match and takes the new version', async () => {
    const log = spy();
    const user = userEvent.setup();
    await openPlan();
    await user.selectOptions(screen.getByLabelText('Type of lesson 1'), 'practice');
    expect(screen.getByLabelText('Type of lesson 1')).toHaveValue('practice'); // optimistic
    await waitFor(() => expect(log.find((r) => r.method === 'PATCH')?.body).toEqual({ version: 1, rows: [{ index: 1, type: 'practice' }] }));
    expect(log.find((r) => r.method === 'PATCH')!.ifMatch).toBe('1');

    // The next edit goes out with the version the server returned.
    fireEvent.change(screen.getByLabelText('Date of lesson 3 for 8б'), { target: { value: '2026-09-19' } });
    await waitFor(() => expect(log.filter((r) => r.method === 'PATCH')[1]?.body).toEqual({ version: 2, rows: [{ index: 3, dates: { '8б': '2026-09-19' } }] }));
    expect(log.filter((r) => r.method === 'PATCH')[1].ifMatch).toBe('2');
  });

  it('on a 409 conflict refetches the plan and tells the teacher', async () => {
    server.use(http.patch(`${API_PREFIX}/ktp/:id`, () => HttpResponse.json(problem('version_mismatch'), { status: 409 })));
    const user = userEvent.setup();
    await openPlan();
    await user.selectOptions(screen.getByLabelText('Type of lesson 1'), 'test');
    await waitFor(() => expect(useUi.getState().toasts.some((x) => x.key === 'ktp.conflict')).toBe(true));
    await waitFor(() => expect(screen.getByLabelText('Type of lesson 1')).toHaveValue('new'));
  });

  it('links a topic with the picker and shows auto matches', async () => {
    const log = spy();
    const user = userEvent.setup();
    await openPlan();
    expect((await screen.findAllByRole('link', { name: 'Open the topic “The Pythagorean theorem”' })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('auto · 54%').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Link a topic to lesson 1' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox'), 'cube');
    await user.click(await within(dialog).findByRole('button', { name: 'Cube and pyramid' }));
    await waitFor(() => expect(log.find((r) => r.method === 'PATCH')?.body).toEqual({ version: 1, rows: [{ index: 1, topicKey: 'cube-pyramid' }] }));
    const row = document.getElementById('ktp-row-1')!;
    expect(within(row).getByRole('link', { name: 'Open the topic “Cube and pyramid”' })).toHaveAttribute('href', expect.stringMatching(/^\/en\/math\/.*cube-pyramid$/));
    expect(within(row).queryByText(/auto/)).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Change the topic of lesson 1' }));
    await user.click(within(row).getByRole('button', { name: 'Remove the link' }));
    await waitFor(() => expect(within(row).getByText('Not linked')).toBeInTheDocument());
  });

  it('downloads one lesson plan and the week (range endpoint, from/to by index)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 9, 0));
    const week = fixture.rows.filter((r) => r.dates['8б'] && r.dates['8б'] >= '2026-10-19' && r.dates['8б'] <= '2026-10-25').map((r) => r.index);
    const log = spy();
    const user = userEvent.setup();
    await openPlan();

    const bar = screen.getByRole('region', { name: /This week · 8б/ });
    await user.click(within(bar).getByRole('button', { name: `Download the week (${week.length} plans)` }));
    await waitFor(() => expect(saved).toContain('Сабак-пландары_8б_21-24.docx'));
    const get = log.find((r) => r.url.pathname.endsWith('/plans'))!;
    expect(Object.fromEntries(get.url.searchParams)).toEqual({ class: '8б', from: String(Math.min(...week)), to: String(Math.max(...week)) });

    await user.click(screen.getAllByRole('button', { name: 'Download the plan of lesson 5 for 8б (.docx)' })[0]);
    await waitFor(() => expect(saved).toContain('Сабак-планы_8б_5.docx'));
  });

  it('selects a range with shift-click and enforces the maximum', async () => {
    const log = spy();
    const user = userEvent.setup();
    await openPlan();
    await user.click(screen.getByLabelText('Select lesson 3'));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByLabelText('Select lesson 7'));
    await user.keyboard('{/Shift}');
    expect(screen.getByLabelText('From lesson')).toHaveValue(3);
    expect(screen.getByLabelText('To lesson')).toHaveValue(7);
    await user.click(screen.getByRole('button', { name: 'Download 5 plans' }));
    await waitFor(() => expect(log.some((r) => r.url.pathname.endsWith('/plans') && r.url.searchParams.get('to') === '7')).toBe(true));

    fireEvent.change(screen.getByLabelText('To lesson'), { target: { value: '20' } });
    expect(screen.getByRole('button', { name: 'Download 18 plans' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('At most 10 lessons in one file');
  });

  it('shows cards instead of the table at phone width (360 px)', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
    await openPlan();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cards = screen.getByTestId('ktp-cards');
    expect(within(cards).getAllByRole('article')).toHaveLength(138);
    expect(within(cards).getByLabelText('Type of lesson 1')).toBeInTheDocument();
  });

  it('shows «not found» for a plan that is not there', async () => {
    renderPage('/en/teacher/ktp/0192a000-0000-7000-8000-00000000ffff', '/:lang/teacher/ktp/:id', <KtpPlanPage />);
    expect(await screen.findByText(/This KTP was not found/)).toBeInTheDocument();
  });
});
