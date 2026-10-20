import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, KTP_MAX_BYTES, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { loginAdult } from '../api/session';
import { resetSession } from '../cabinet/testUtils';
import { KTP_ID, TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
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

/** The teacher page and the plan page in one router, so «Fix» / «Open» really land on the plan. */
function renderApp(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let location = '';
  const Spy = () => {
    location = window.location.href;
    return null;
  };
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:lang/teacher" element={<TeacherPage />} />
          <Route path="/:lang/teacher/ktp/:id" element={<KtpPlanPage />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
        <Spy />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return () => location;
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

/** Tuesday 20 October 2026: lessons 21–24 of the fixture fall in this week. */
const onTuesday = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20, 9, 0));
};

const openPlan = async (query = '') => {
  renderApp(`/en/teacher/ktp/${KTP_ID}${query}`);
  return screen.findByRole('heading', { level: 1, name: 'Алгебра · Grade 8' }, { timeout: 5000 });
};

const openList = async () => {
  const user = userEvent.setup();
  renderApp('/en/teacher');
  await user.click(await screen.findByRole('tab', { name: 'Lesson plans (KTP)' }));
  return screen.findByTestId('ktp-plan-item', {}, { timeout: 5000 });
};

describe('КТП: list and the «Add a KTP» flow', () => {
  it('lists the plan with one problem count; delete asks first, then the add flow takes the section', async () => {
    const user = userEvent.setup();
    const item = await openList();
    expect(within(item).getByRole('heading', { name: 'Алгебра · Grade 8' })).toBeInTheDocument();
    expect(within(item).getByText(/^138 lessons · 8б, 8в · updated/)).toBeInTheDocument();
    expect(within(item).getByTestId('ktp-count')).toHaveTextContent('1 error · 5 warnings');

    await user.click(within(item).getByRole('button', { name: 'Delete “Алгебра · Grade 8”' }));
    expect(within(item).getByText(/Lesson plans you have already downloaded stay/)).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('list', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByLabelText('KTP file (.docx)')).toBeInTheDocument();
    expect(screen.queryByTestId('ktp-plan-item')).not.toBeInTheDocument();
  });

  it('checks the file, shows «Checking…», then a summary with errors first and a working «Fix»', async () => {
    const log = spy();
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Hold the upload until the «checking» state is asserted, then fall through to the mock handler.
    server.use(http.post(`${API_PREFIX}/ktp`, async () => void (await gate)));
    await openList();
    await user.click(screen.getByRole('button', { name: 'Add a KTP' }));
    const input = screen.getByLabelText('KTP file (.docx)') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/This is not a .docx file/);
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(KTP_MAX_BYTES + 1)], 'big.docx')] } });
    expect(await screen.findByText('The file is larger than 4 MB.')).toBeInTheDocument();
    expect(log.filter((r) => r.method === 'POST')).toHaveLength(0);

    fireEvent.change(input, { target: { files: [new File(['PK-docx'], 'КТП алгебра.docx')] } });
    expect(await screen.findByRole('status')).toHaveTextContent('Checking your KTP…');
    release();

    const summary = await screen.findByTestId('ktp-summary', {}, { timeout: 5000 });
    const post = log.find((r) => r.method === 'POST')!;
    await waitFor(() => expect(post.body).toEqual({ fileName: 'КТП алгебра.docx', data: btoa('PK-docx') }));
    expect(within(summary).getByRole('heading', { name: 'Your KTP is ready' })).toHaveFocus();
    expect(within(summary).getByText('138 lessons · 8б, 8в · 2026–2027')).toBeInTheDocument();
    expect(within(summary).getByTestId('ktp-count')).toHaveTextContent('1 error · 5 warnings');
    // Errors first; warnings wait behind a button; info notes are never listed.
    const items = within(summary).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Error');
    expect(items[0]).toHaveTextContent('Lesson 109 · 8в');
    expect(items[0]).toHaveTextContent('The KTP says “31.04.27”, but that date does not exist.');
    await user.click(within(summary).getByRole('button', { name: 'Show 5 more warnings' }));
    expect(within(summary).getAllByRole('listitem')).toHaveLength(6);

    // «Fix» opens the new plan with that lesson's sheet, on the 8в date.
    await user.click(within(items[0]).getByRole('button', { name: /^Fix: Lesson 109 · 8в/ }));
    const sheet = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(sheet).getByText('Lesson 109', { exact: false })).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Date for 8в')).toHaveFocus();
  });

  it('shows the server error of an upload and lets the teacher try again', async () => {
    server.use(http.post(`${API_PREFIX}/ktp`, () => HttpResponse.json(problem('payload_too_large'), { status: 413 })));
    const user = userEvent.setup();
    await openList();
    await user.click(screen.getByRole('button', { name: 'Add a KTP' }));
    fireEvent.change(screen.getByLabelText('KTP file (.docx)'), { target: { files: [new File(['PK'], 'ktp.docx')] } });
    expect(await screen.findByText('We could not read this file: The file is too large')).toBeInTheDocument();
    expect(screen.getByLabelText('KTP file (.docx)')).toBeInTheDocument();
  });
});

describe('КТП: plan page', () => {
  it('shows the same problem count as the list', async () => {
    const item = await openList();
    const listed = within(item).getByTestId('ktp-count').textContent;
    const user = userEvent.setup();
    await user.click(within(item).getByRole('link', { name: 'Open “Алгебра · Grade 8”' }));
    await screen.findByRole('heading', { level: 1, name: 'Алгебра · Grade 8' }, { timeout: 5000 });
    expect(screen.getByTestId('ktp-count').textContent).toBe(listed);
    // The 8б class view does not change it (the 8в error still counts).
    expect(listed).toBe('1 error · 5 warnings');
  });

  it('opens on this week, grouped by day for the selected class', async () => {
    onTuesday();
    const user = userEvent.setup();
    await openPlan();
    expect(screen.getByRole('tab', { name: 'This week' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'October 19 – October 25' })).toBeInTheDocument();

    const day = (iso: string) => screen.getByTestId(`ktp-day-${iso}`);
    expect(within(day('2026-10-19')).getByRole('heading', { name: /Monday/ })).toBeInTheDocument();
    expect(within(day('2026-10-19')).getByRole('button', { name: /^Lesson 21: Текшерүү иши №2/ })).toBeInTheDocument();
    expect(within(day('2026-10-20')).getByText('Today')).toBeInTheDocument();
    expect(within(day('2026-10-20')).getByRole('button', { name: /^Lesson 22:/ })).toBeInTheDocument();
    expect(within(day('2026-10-21')).getByText('No lessons')).toBeInTheDocument();
    expect(within(day('2026-10-22')).getByRole('button', { name: /^Lesson 23:/ })).toBeInTheDocument();
    expect(within(day('2026-10-24')).getByText('No lessons')).toBeInTheDocument(); // Saturday is a school day
    expect(screen.queryByTestId('ktp-day-2026-10-25')).not.toBeInTheDocument(); // Sunday only when a lesson falls on it

    await user.click(screen.getByRole('button', { name: '8в' }));
    expect(within(day('2026-10-21')).getByRole('button', { name: /^Lesson 23:/ })).toBeInTheDocument();
    expect(within(day('2026-10-23')).getByText('No lessons')).toBeInTheDocument();
    expect(localStorage.getItem(`bilig.ktp.class.${KTP_ID}`)).toBe('8в');
  });

  it('downloads the week through the range endpoint and one lesson plan', async () => {
    onTuesday();
    const log = spy();
    const user = userEvent.setup();
    await openPlan();
    await user.click(screen.getByRole('button', { name: "Download the plans for this week's 4 lessons (.docx)" }));
    await waitFor(() => expect(saved).toContain('Сабак-пландары_8б_21-24.docx'));
    const get = log.find((r) => r.url.pathname.endsWith('/plans'))!;
    expect(Object.fromEntries(get.url.searchParams)).toEqual({ class: '8б', from: '21', to: '24' });

    await user.click(screen.getByRole('button', { name: 'Download the plan of lesson 22 for 8б (.docx)' }));
    await waitFor(() => expect(saved).toContain('Сабак-планы_8б_22.docx'));
  });

  it('moves between weeks and jumps back with «Today»', async () => {
    onTuesday();
    const user = userEvent.setup();
    await openPlan();
    const today = screen.getByRole('button', { name: 'Today' });
    expect(today).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('heading', { level: 2, name: 'November 2 – November 8' })).toBeInTheDocument();
    expect(screen.queryByText('Today', { selector: 'span' })).not.toBeInTheDocument();
    await user.click(today);
    expect(screen.getByRole('heading', { level: 2, name: 'October 19 – October 25' })).toBeInTheDocument();
    expect(today).toBeDisabled();
  });

  it('a week without lessons offers the next lesson', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15, 9, 0)); // summer
    const user = userEvent.setup();
    await openPlan();
    expect(screen.getByText('No lessons for 8б this week.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Next lesson: September 15/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'September 14 – September 20' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lesson 1: Сандар системасы/ })).toBeInTheDocument();
  });

  it('«Fix» on the plan page opens the lesson sheet; Save sends one PATCH row with If-Match', async () => {
    const log = spy();
    const user = userEvent.setup();
    await openPlan();
    await user.click(screen.getByRole('button', { name: 'Show the problems' }));
    const list = document.getElementById('ktp-problems')!;
    await user.click(within(list).getByRole('button', { name: /^Fix: Lesson 109 · 8в/ }));

    const sheet = await screen.findByRole('dialog');
    const date = within(sheet).getByLabelText('Date for 8в');
    expect(date).toHaveFocus();
    expect(date).toHaveValue('');
    expect(within(sheet).getByLabelText('Date for 8б')).toHaveValue('01.04.2027');
    expect(within(sheet).getByText('The KTP says “31.04.27”, but that date does not exist.')).toBeInTheDocument();

    // A date that does not exist is caught before anything is sent.
    await user.type(date, '31.04.2027');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByText('Write the date as dd.mm.yyyy, for example 20.10.2026.')).toBeInTheDocument();
    expect(log.some((r) => r.method === 'PATCH')).toBe(false);

    await user.clear(date);
    await user.type(date, '31.03.2027');
    expect(within(sheet).getByText('Wednesday, March 31, 2027')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('radio', { name: 'Practice' }));
    await user.type(within(sheet).getByLabelText('Homework'), '§ 12, № 3');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(log.find((r) => r.method === 'PATCH')?.body).toEqual({ version: 1, rows: [{ index: 109, type: 'practice', homework: '§ 12, № 3', dates: { '8в': '2027-03-31' } }] }));
    expect(log.find((r) => r.method === 'PATCH')!.ifMatch).toBe('1');
    await waitFor(() => expect(screen.getByTestId('ktp-count')).toHaveTextContent('5 warnings'));
    expect(useUi.getState().toasts.some((x) => x.key === 'ktp.sheet.saved')).toBe(true);
  });

  it('Cancel closes the sheet without a request', async () => {
    const log = spy();
    const user = userEvent.setup();
    await openPlan('?lesson=3');
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText('Homework'), 'x');
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(log.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('on a 409 conflict refetches the plan and tells the teacher', async () => {
    server.use(http.patch(`${API_PREFIX}/ktp/:id`, () => HttpResponse.json(problem('version_mismatch'), { status: 409 })));
    const user = userEvent.setup();
    await openPlan('?lesson=1');
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('radio', { name: 'Test' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useUi.getState().toasts.some((x) => x.key === 'ktp.conflict')).toBe(true));
  });

  it('links a topic from the sheet', async () => {
    const log = spy();
    const user = userEvent.setup();
    await openPlan('?lesson=1');
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('No Bilig topic')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Choose a topic' }));
    await user.type(within(sheet).getByRole('searchbox'), 'cube');
    await user.click(await within(sheet).findByRole('button', { name: 'Cube and pyramid' }));
    expect(within(sheet).getByRole('link', { name: 'Open the topic “Cube and pyramid”' })).toHaveAttribute('href', expect.stringMatching(/^\/en\/math\/.*cube-pyramid$/));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(log.find((r) => r.method === 'PATCH')?.body).toEqual({ version: 1, rows: [{ index: 1, topicKey: 'cube-pyramid' }] }));
  });

  it('«All lessons»: sections collapsed with counts, search and «only with problems»', async () => {
    const user = userEvent.setup();
    await openPlan();
    await user.click(screen.getByRole('tab', { name: 'All lessons' }));
    const section = screen.getByRole('button', { name: /^Сан\s*10 lessons/ });
    expect(section).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Lesson 1:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); // no inline inputs in rows
    await user.click(section);
    expect(screen.getByRole('button', { name: /^Lesson 1: Сандар системасы/ })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search lessons' }), 'катыштар');
    const hits = screen.getAllByRole('button', { name: /^Lesson \d+:/ });
    expect(hits.map((b) => b.getAttribute('aria-label'))).toContain('Lesson 23: Катыштар. Open to edit');
    expect(hits.every((b) => /катыштар/i.test(b.getAttribute('aria-label')!) || /Катыштар/.test(b.closest('li[id]')!.textContent!))).toBe(true);

    await user.clear(screen.getByRole('searchbox', { name: 'Search lessons' }));
    await user.click(screen.getByRole('checkbox', { name: 'Only lessons with problems' }));
    const problems = screen.getAllByRole('button', { name: /^Lesson \d+:/ }).map((b) => Number(/Lesson (\d+)/.exec(b.getAttribute('aria-label')!)![1]));
    expect(problems).toEqual([90, 109, 119]);

    await user.click(screen.getByRole('button', { name: /^Lesson 109:/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('a section problem opens that section in «All lessons»', async () => {
    const user = userEvent.setup();
    await openPlan();
    await user.click(screen.getByRole('button', { name: 'Show the problems' }));
    await user.click(screen.getByRole('button', { name: 'Show 5 more warnings' }));
    await user.click(screen.getByRole('button', { name: /^Fix: The section “Кайталоо”/ }));
    expect(screen.getByRole('tab', { name: 'All lessons' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /^Кайталоо/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(document.getElementById('ktp-sec-128')!).getByText('The section “Кайталоо” says 8 hours, but its lessons take 11.')).toBeInTheDocument();
  });

  it('speaks the teacher’s language (ky)', async () => {
    await i18n.changeLanguage('ky');
    onTuesday();
    renderApp(`/ky/teacher/ktp/${KTP_ID}?lesson=109`);
    const sheet = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(sheet).getByText('КТПда «31.04.27» деп жазылган — мындай күн жок.')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('8б классынын датасы')).toHaveValue('01.04.2027');
    expect(within(sheet).getByText(/^Бейшемби, /)).toBeInTheDocument();
    await userEvent.setup().click(within(sheet).getByRole('button', { name: 'Жокко чыгаруу' }));
    expect(within(screen.getByTestId('ktp-day-2026-10-19')).getByRole('heading', { name: /^Дүйшөмбү/ })).toBeInTheDocument();
  });

  it('shows «not found» for a plan that is not there', async () => {
    renderApp('/en/teacher/ktp/0192a000-0000-7000-8000-00000000ffff');
    expect(await screen.findByText(/This KTP was not found/, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
