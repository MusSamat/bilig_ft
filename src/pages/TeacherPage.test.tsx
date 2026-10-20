import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../i18n';
import { api } from '../api/client';
import { loadMe, useSession } from '../api/session';
import { tokens } from '../api/tokens';
import { renderPage, resetSession } from '../cabinet/testUtils';
import KtpPlanPage from '../ktp/KtpPlanPage';
import { FRESH_PHONE, HALF_PHONE, READY_8B_ID, READY_8V_ID, READY_9A_ID, READY_KTP_ID, READY_PHONE, TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
import TeacherPage from './TeacherPage';

const sent: { method: string; path: string; search: string; body: unknown }[] = [];

beforeEach(async () => {
  resetSession();
  sent.length = 0;
  await i18n.changeLanguage('en');
  server.events.on('request:start', async ({ request }) => {
    const url = new URL(request.url);
    const body = request.method === 'PATCH' || request.method === 'POST' ? await request.clone().json().catch(() => null) : null;
    sent.push({ method: request.method, path: url.pathname, search: url.search, body });
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Signs in through the mock API (phone for teachers registered by WhatsApp, e-mail for the school teacher). */
async function signIn(id: { phone: string } | { email: string }) {
  await act(async () => {
    const res = await api('login', { body: { ...id, password: TEACHER_PASSWORD } });
    tokens.set(res.accessToken, res.expiresIn);
    await loadMe();
  });
}

const patches = () => sent.filter((r) => r.method === 'PATCH' && r.path.endsWith('/me')).map((r) => r.body);
const classPatches = () => sent.filter((r) => r.method === 'PATCH' && r.path.includes('/classes/')).map((r) => r.body);
const open = (path = '/en/teacher') => renderPage(path, '/:lang/teacher', <TeacherPage />);

/** Tuesday 20 October 2026: lesson 22 of the fixture КТП is today for 8б. */
const onTuesday = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20, 9, 0));
};

describe('Teacher cabinet: access', () => {
  it('asks guests to sign in', () => {
    open();
    expect(screen.getByText(/This page is for teachers/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/en/login');
  });
});

describe('Setup screen (contract 0.8.0 §6.1: profileStatus incomplete)', () => {
  it('shows only the setup steps; each step sends its own PATCH /me or POST /classes; completion opens the home', async () => {
    await signIn({ phone: FRESH_PHONE });
    expect(useSession.getState().me?.profileStatus).toBe('incomplete');
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Let’s set up your dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument(); // not the full cabinet
    expect(screen.getByText('0 / 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.split(' — ')[0])).toEqual(['Full name', 'School', 'Teaching language', 'First class and subject']);
    // Gentle: what can wait is said, never required.
    expect(screen.getByText(/Uploading your KTP and confirming your phone can wait/)).toBeInTheDocument();

    // 1. Name — the first open step is already expanded and focused.
    const name = screen.getByLabelText('Full name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue(''); // not the phone number
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(patches()).toEqual([]);
    await user.type(name, 'Айгүл Осмонова');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('1 / 4')).toBeInTheDocument());
    expect(patches()).toEqual([{ displayName: 'Айгүл Осмонова' }]);
    expect(screen.getByRole('button', { name: 'Change: Full name' })).toBeInTheDocument();

    // 2. School + region — opens by itself.
    await user.type(await screen.findByLabelText('School name'), 'Ош ш., №12 мектеп');
    await user.selectOptions(screen.getByLabelText('Region'), 'osh-city');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('2 / 4')).toBeInTheDocument());
    expect(patches()[1]).toEqual({ schoolName: 'Ош ш., №12 мектеп', region: 'osh-city' });
    expect(screen.getByText('Ош ш., №12 мектеп')).toBeInTheDocument();

    // 3. Teaching language: four plain names.
    const langs = await screen.findByRole('group', { name: 'Which language do you teach in?' });
    expect(within(langs).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['Kyrgyz', 'Russian', 'Uzbek', 'English']);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Choose the teaching language')).toBeInTheDocument();
    await user.click(within(langs).getByRole('radio', { name: 'Russian' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('3 / 4')).toBeInTheDocument());
    expect(patches()[2]).toEqual({ teachingLang: 'ru' });

    // 4. The first class: the label as typed, a grade, one or more subjects.
    const label = await screen.findByLabelText('Class name');
    await user.click(screen.getByRole('button', { name: 'Add class' }));
    expect(screen.getByText('Enter the class name')).toBeInTheDocument();
    await user.type(label, '8 Б');
    await user.selectOptions(screen.getByLabelText('Grade'), '8');
    await user.click(screen.getByRole('button', { name: 'Add class' }));
    expect(screen.getByText('Choose at least one subject')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Physics' }));
    await user.click(screen.getByRole('button', { name: 'Mathematics' }));
    expect(screen.getByRole('button', { name: 'Physics' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Add class' }));

    // Complete → straight into the home with the class as typed.
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Айгүл!' })).toBeInTheDocument();
    expect(sent.find((r) => r.method === 'POST' && r.path.endsWith('/classes'))?.body).toEqual({ name: '8 Б', grade: 8, subjectKeys: ['phys', 'math'] });
    expect(useSession.getState().me?.profileStatus).toBe('complete');
    expect(screen.queryByText('Let’s set up your dashboard')).not.toBeInTheDocument();
    const tiles = await screen.findAllByTestId('class-tile');
    expect(tiles.map((t) => within(t).getByRole('heading').textContent)).toEqual(['8 Б']);
    // The KTP hint is gentle: the home is fully usable.
    expect(await screen.findByText(/Upload your KTP — each class will show/)).toBeInTheDocument();
    // The trial follows the class: its grade and subjects are now covered.
    expect(useSession.getState().me?.licenses?.find((l) => l.trial)).toMatchObject({ subjects: ['phys', 'math'], grades: [8] });
  });

  it('opens on the first step still to do (name and school already filled)', async () => {
    await signIn({ phone: HALF_PHONE });
    open();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change: Full name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change: School' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Which language do you teach in?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill in: First class and subject' })).toBeInTheDocument();
  });

  it('is not shown to a complete teacher, nor to a school-licensed teacher', async () => {
    await signIn({ phone: READY_PHONE });
    const view = open();
    expect(screen.getByRole('heading', { level: 1, name: 'Hello, Айгүл!' })).toBeInTheDocument();
    expect(screen.queryByText('Let’s set up your dashboard')).not.toBeInTheDocument();
    view.unmount();

    resetSession();
    await signIn({ email: TEACHER_EMAIL });
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Hello, Гүлнара!' })).toBeInTheDocument();
    expect(screen.queryByText(/Free trial/)).not.toBeInTheDocument();
  });
});

describe('Home «My classes» (§6.2)', () => {
  it('shows tiles only for the teacher’s own classes, as typed, plus the add tile', async () => {
    await signIn({ phone: READY_PHONE });
    open();
    const tiles = await screen.findAllByTestId('class-tile');
    expect(tiles.map((t) => within(t).getByRole('heading').textContent)).toEqual(['8Б', '8-В', '9 А']);
    expect(within(tiles[0]).getByText('Grade 8 · 3 students')).toBeInTheDocument();
    expect(await within(tiles[0]).findByText('Mathematics')).toBeInTheDocument();
    expect(within(tiles[0]).getByText('Physics')).toBeInTheDocument();
    expect(within(tiles[2]).getByText('Grade 9 · 0 students')).toBeInTheDocument();
    expect(screen.queryByText('7А')).not.toBeInTheDocument(); // another school's class
    expect(screen.getAllByRole('button', { name: 'Add a class' })).toHaveLength(1);
    // READY has a phone and a KTP: no hints.
    expect(screen.queryByRole('heading', { name: 'Tips' })).not.toBeInTheDocument();
  });

  it('adds a class in a sheet: grade 12 is allowed, at least one subject; the new class opens on its subjects', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Add a class' }));
    const sheet = screen.getByRole('dialog', { name: 'New class' });
    expect(within(sheet).getByLabelText('Class name')).toHaveFocus();
    const grade = within(sheet).getByLabelText('Grade');
    expect(within(grade).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]);
    await user.type(within(sheet).getByLabelText('Class name'), '12А');
    await user.click(within(sheet).getByRole('button', { name: 'Add class' }));
    expect(within(sheet).getByText('Choose the grade')).toBeInTheDocument();
    await user.selectOptions(grade, '12');
    await user.click(within(sheet).getByRole('button', { name: 'Add class' }));
    expect(within(sheet).getByText('Choose at least one subject')).toBeInTheDocument();
    expect(sent.some((r) => r.method === 'POST' && r.path.endsWith('/classes'))).toBe(false);
    // A self-registered teacher picks from every live subject of the catalog.
    expect(within(sheet).getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual(['Biology', 'Chemistry', 'Physics', 'Mathematics', 'Geography', 'Astronomy']);
    await user.click(within(sheet).getByRole('button', { name: 'Physics' }));
    await user.click(within(sheet).getByRole('button', { name: 'Chemistry' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add class' }));

    expect(await screen.findByRole('heading', { level: 1, name: '12А' })).toBeInTheDocument();
    expect(sent.find((r) => r.method === 'POST' && r.path.endsWith('/classes'))?.body).toEqual({ name: '12А', grade: 12, subjectKeys: ['phys', 'chem'] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const cards = await screen.findAllByTestId('subject-card');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Physics', 'Chemistry']);
  });

  it('closes the sheet with Escape without creating anything', async () => {
    await signIn({ email: TEACHER_EMAIL });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Add a class' }));
    expect(screen.getByRole('dialog', { name: 'New class' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent.some((r) => r.method === 'POST' && r.path.endsWith('/classes'))).toBe(false);
  });
});

describe('A class → its subjects (§6.3)', () => {
  it('shows a card per subject: КТП ready with problems, next lesson, plan download and progress; or «no КТП» with an upload', async () => {
    onTuesday();
    const saved: string[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('link', { name: 'Open class “8Б”' }));
    expect(await screen.findByRole('heading', { level: 1, name: '8Б' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Subjects' })).toHaveAttribute('aria-selected', 'true');
    const cards = await screen.findAllByTestId('subject-card');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Mathematics', 'Physics']);
    expect(sent.some((r) => r.method === 'GET' && r.path.endsWith(`/classes/${READY_8B_ID}/subjects`))).toBe(true);

    const [math, phys] = cards;
    expect(within(math).getByText('KTP ready')).toBeInTheDocument();
    expect(within(math).getByTestId('ktp-count')).toHaveTextContent('1 error · 5 warnings');
    expect(within(math).getByText(/^Today · /)).toBeInTheDocument();
    expect(within(math).getByText('Текшерүү ишти анализдөө')).toBeInTheDocument();
    expect(within(math).getByRole('link', { name: 'The Pythagorean theorem' })).toHaveAttribute('href', expect.stringContaining('/en/math/'));
    expect(within(math).getByText('21 / 138 lessons')).toBeInTheDocument();
    expect(within(math).getByRole('progressbar', { name: 'Mathematics: lessons done' })).toHaveAttribute('aria-valuenow', '21');
    await user.click(within(math).getByRole('button', { name: 'Plan (.docx): lesson 22, Текшерүү ишти анализдөө' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const req = sent.find((r) => r.path.endsWith(`/ktp/${READY_KTP_ID}/lessons/22/plan`))!;
    expect(new URLSearchParams(req.search).get('class')).toBe('8б'); // the КТП column linked to 8Б

    expect(within(phys).getByText('No KTP uploaded')).toBeInTheDocument();
    expect(within(phys).queryByRole('progressbar')).not.toBeInTheDocument();
    const upload = within(phys).getByRole('button', { name: 'Upload KTP: Physics, 8Б' });
    expect(upload.className).toContain('bg-accent'); // the one primary action of the view
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-accent text-on shadow-panel'))).toHaveLength(1);

    // The other sub-areas stay one tab away.
    const nav = screen.getByRole('tablist', { name: 'Class sections' });
    expect(within(nav).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Subjects', 'Students', 'Assignments', 'Results', 'Join code', 'Settings']);
  });

  it('adds and removes subjects of the class with PATCH subjectKeys; the last subject cannot be removed', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    open(`/en/teacher?class=${READY_8V_ID}`);
    const [only] = await screen.findAllByTestId('subject-card');
    expect(within(only).getByText('No KTP uploaded')).toBeInTheDocument(); // 8в of the КТП is not linked to «8-В»
    expect(within(only).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a subject' }));
    const sheet = screen.getByRole('dialog', { name: 'Add a subject' });
    expect(within(sheet).queryByRole('button', { name: 'Mathematics' })).not.toBeInTheDocument(); // already there
    await user.click(within(sheet).getByRole('button', { name: 'Add' }));
    expect(within(sheet).getByText('Choose at least one subject')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Physics' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(classPatches()).toEqual([{ subjectKeys: ['math', 'phys'] }]));
    await waitFor(() => expect(screen.getAllByTestId('subject-card')).toHaveLength(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Physics from 8-В' }));
    expect(screen.getByText('Remove Physics from 8-В? Your KTP and lesson plans stay.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(classPatches()[1]).toEqual({ subjectKeys: ['math'] }));
    await waitFor(() => expect(screen.getAllByTestId('subject-card')).toHaveLength(1));
  });

  it('uploads a КТП from a subject card: the class is linked to a free КТП column', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    open(`/en/teacher?class=${READY_9A_ID}`);
    const cards = await screen.findAllByTestId('subject-card');
    await user.click(within(cards[0]).getByRole('button', { name: 'Upload KTP: Chemistry, 9 А' }));
    const sheet = await screen.findByRole('dialog', { name: 'KTP: 9 А, Chemistry' });
    fireEvent.change(within(sheet).getByLabelText('KTP file (.docx)'), { target: { files: [new File(['PK-docx'], 'КТП.docx')] } });
    const summary = await within(sheet).findByTestId('ktp-summary', {}, { timeout: 5000 });
    // 8б matched «8Б» by name on upload; 8в was free, so it is linked to this class.
    const patch = sent.find((r) => r.method === 'PATCH' && r.path.includes('/ktp/'));
    expect(patch?.body).toMatchObject({ classLinks: { '8б': READY_8B_ID, '8в': READY_9A_ID } });
    const links = within(summary).getByTestId('ktp-class-links');
    await waitFor(() => expect(within(links).getByLabelText('Link to a class: 8в')).toHaveValue(READY_9A_ID));
    expect(within(links).getByLabelText('Link to a class: 8б')).toHaveValue(READY_8B_ID);
  });
});

describe('КТП ↔ classes (classLinks)', () => {
  it('the plan page shows each column’s class and links one with PATCH classLinks; the class card follows', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/en/teacher/ktp/${READY_KTP_ID}`]}>
          <Routes>
            <Route path="/:lang/teacher/ktp/:id" element={<KtpPlanPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const links = await screen.findByTestId('ktp-class-links', {}, { timeout: 5000 });
    expect(within(links).getByRole('heading', { name: 'Classes' })).toBeInTheDocument();
    expect(within(links).getByText('In the KTP: 8в').parentElement).toHaveTextContent('not linked');
    const select = within(links).getByLabelText('Link to a class: 8в');
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not linked', '8Б · Grade 8', '8-В · Grade 8', '9 А · Grade 9']));
    await user.selectOptions(select, READY_8V_ID);
    await waitFor(() => expect(sent.find((r) => r.method === 'PATCH' && r.path.includes('/ktp/'))?.body).toMatchObject({ classLinks: { '8б': READY_8B_ID, '8в': READY_8V_ID } }));
    await waitFor(() => expect(within(links).getByText('In the KTP: 8в').parentElement).toHaveTextContent('8-В'));
    const subjects = await api('classSubjects', { params: { id: READY_8V_ID } });
    expect(subjects.items[0]).toMatchObject({ subjectKey: 'math', ktp: { status: 'parsed', planId: READY_KTP_ID } });
  });
});

describe('Inside a class: the secondary sub-areas', () => {
  it('has breadcrumbs and students, assignments, results, join code, settings', async () => {
    await signIn({ email: TEACHER_EMAIL });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('link', { name: 'Open class “7А”' }));
    expect(await screen.findByRole('heading', { level: 1, name: '7А' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getByText('7А')).toHaveAttribute('aria-current', 'page');
    const nav = screen.getByRole('tablist', { name: 'Class sections' });
    await user.click(within(nav).getByRole('tab', { name: 'Students' }));
    expect(await screen.findByText('Айбек Т.')).toBeInTheDocument();

    // A new PIN asks first.
    await user.click(screen.getByRole('button', { name: 'New PIN for Айбек Т.' }));
    await user.click(screen.getByRole('button', { name: 'Give a new PIN' }));
    expect(await screen.findAllByTestId('card-pin')).toHaveLength(1);

    // Assignments: one primary action, the form in a sheet.
    await user.click(within(nav).getByRole('tab', { name: 'Assignments' }));
    await user.click(await screen.findByRole('button', { name: 'Give assignment' }));
    const sheet = screen.getByRole('dialog', { name: 'New assignment' });
    await waitFor(() => expect(within(sheet).getAllByRole('option').length).toBeGreaterThan(2));
    await user.selectOptions(within(sheet).getByLabelText('Topic'), 'water');
    await user.click(within(sheet).getByRole('button', { name: 'Give' }));
    expect(await screen.findByText('Water')).toBeInTheDocument();

    // Results
    await user.click(within(nav).getByRole('tab', { name: 'Results' }));
    expect(await screen.findByText('0 of 5 done')).toBeInTheDocument();

    // Join code: a new code asks first.
    await user.click(within(nav).getByRole('tab', { name: 'Join code' }));
    expect(screen.getAllByText('ABC123').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Get a new code' }));
    expect(screen.getByText('The old code will stop working. Continue?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, new code' }));
    await waitFor(() => expect(sent.some((r) => r.path.endsWith('/join-code'))).toBe(true));

    // Settings: name and grade (subjects live on the subject cards); grade 12 exists.
    await user.click(within(nav).getByRole('tab', { name: 'Settings' }));
    expect(screen.queryByRole('group', { name: 'Subjects' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Grade'), '12');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(classPatches()).toEqual([{ grade: 12 }]));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '7А' }).nextElementSibling).toHaveTextContent('Grade 12'));

    // Back to the cabinet.
    await user.click(within(crumbs).getByRole('link', { name: 'Teacher dashboard' }));
    expect(await screen.findByRole('link', { name: 'Open class “7А”' })).toBeInTheDocument();
  });

  it('adds students from a CSV file and shows their PINs on sign-in cards', async () => {
    await signIn({ email: TEACHER_EMAIL });
    const user = userEvent.setup();
    open('/en/teacher?class=0192a000-0000-7000-8000-0000000000c1&view=students');
    await user.click(await screen.findByRole('button', { name: 'Add students' }));
    const sheet = screen.getByRole('dialog', { name: 'Add students to “7А”' });
    const file = new File(['name\nАйгүл Б.\nТимур С.\n'], 'list.csv', { type: 'text/csv' });
    fireEvent.change(within(sheet).getByLabelText('Import a CSV file'), { target: { files: [file] } });
    const pins = await screen.findAllByTestId('card-pin');
    expect(pins).toHaveLength(2);
    pins.forEach((p) => expect(p.textContent).toMatch(/^\d{4}$/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findAllByText('Тимур С.')).not.toHaveLength(0);
  });
});

describe('Profile and school', () => {
  it('shows the WhatsApp number read-only, edits the name and the teaching language with PATCH /me', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    open('/en/teacher?tab=profile');
    expect(screen.getByText('+996 700 98 76 54')).toBeInTheDocument();
    expect(screen.getByText('Ош ш., №12 мектеп')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit: Name' }));
    const input = screen.getByLabelText('Full name');
    await user.clear(input);
    await user.type(input, 'Айгүл Т.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches()).toEqual([{ displayName: 'Айгүл Т.' }]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit: Name' })).toHaveFocus());

    expect(screen.getByText('Kyrgyz')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit: Teaching language' }));
    await user.click(screen.getByRole('radio', { name: 'Uzbek' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches()[1]).toEqual({ teachingLang: 'uz' }));
    expect(await screen.findByText('Uzbek')).toBeInTheDocument();
  });

  it('a school licence is managed by the school: no school or subject editing', async () => {
    await signIn({ email: TEACHER_EMAIL });
    open('/en/teacher?tab=profile');
    expect(screen.getByText(/school admin manages/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit: School' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit: Subjects and grades' })).not.toBeInTheDocument();
  });
});

describe('Narrow screen (360 px)', () => {
  const check = (container: HTMLElement) => {
    const wide = [...container.querySelectorAll<HTMLElement>('[class]')].filter((el) => {
      const m = /(?:^|\s)(?:w|min-w)-\[(\d+)px\]/.exec(el.className);
      return m && Number(m[1]) > 360;
    });
    expect(wide).toEqual([]);
    const small = [...container.querySelectorAll<HTMLElement>('button')].filter((b) => /(^|\s)(btn|chip|pick)/.test(b.className) === false && !/min-h-11|size-11|min-h-40/.test(b.className));
    expect(small.map((b) => b.textContent)).toEqual([]);
    // No text below 13px: the xs size (12px) is not used.
    expect([...container.querySelectorAll<HTMLElement>('[class*="text-xs"]')]).toEqual([]);
  };

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    window.dispatchEvent(new Event('resize'));
  });

  it('the setup screen has no fixed width over 360 px and 44px buttons', async () => {
    await signIn({ phone: FRESH_PHONE });
    const { container } = open();
    expect(screen.getByText('0 / 4')).toBeInTheDocument();
    check(container);
  });

  it('every section of the cabinet, and a class, too', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    const { container } = open();
    for (const tab of ['My textbook', 'Profile and school', 'My classes']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      check(container);
    }
    await user.click(await screen.findByRole('link', { name: 'Open class “8Б”' }));
    await screen.findAllByTestId('subject-card');
    check(container);
  });
});
