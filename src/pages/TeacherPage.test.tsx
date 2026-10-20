import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../i18n';
import { api } from '../api/client';
import { loadMe, useSession } from '../api/session';
import { tokens } from '../api/tokens';
import { renderPage, resetSession } from '../cabinet/testUtils';
import { FRESH_PHONE, READY_PHONE, TEACHER_PASSWORD, TEACHER_EMAIL } from '../mocks/db';
import { server } from '../mocks/node';
import TeacherPage from './TeacherPage';

const sent: { method: string; path: string; body: unknown }[] = [];

beforeEach(async () => {
  resetSession();
  sent.length = 0;
  await i18n.changeLanguage('en');
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'PATCH' || request.method === 'POST') {
      sent.push({ method: request.method, path: new URL(request.url).pathname, body: await request.clone().json().catch(() => null) });
    }
  });
});
afterEach(() => server.events.removeAllListeners());

/** Signs in through the mock API (phone for teachers registered by WhatsApp, e-mail for the school teacher). */
async function signIn(id: { phone: string } | { email: string }) {
  await act(async () => {
    const res = await api('login', { body: { ...id, password: TEACHER_PASSWORD } });
    tokens.set(res.accessToken, res.expiresIn);
    await loadMe();
  });
}

const patches = () => sent.filter((r) => r.method === 'PATCH' && r.path.endsWith('/me')).map((r) => r.body);
const open = (path = '/en/teacher') => renderPage(path, '/:lang/teacher', <TeacherPage />);

describe('Teacher cabinet: access', () => {
  it('asks guests to sign in', () => {
    open();
    expect(screen.getByText(/This page is for teachers/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/en/login');
  });
});

describe('Finish your account (contract 0.7.0 setup)', () => {
  it('shows the checklist with progress, PATCHes each step and disappears when done', async () => {
    await signIn({ phone: FRESH_PHONE });
    const user = userEvent.setup();
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Hello!' })).toBeInTheDocument(); // the name is still the phone number
    expect(screen.getByText('Free trial: 30 days left')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Finish setting up your account' });
    expect(within(card).getByText('0/3')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    // 1. Name
    await user.click(within(card).getByRole('button', { name: 'Fill in: Your name' }));
    const name = within(card).getByLabelText('Full name');
    expect(name).toHaveValue(''); // not the phone number
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(within(card).getByText('Enter your name')).toBeInTheDocument();
    expect(patches()).toEqual([]);
    await user.type(name, 'Айгүл Осмонова');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(card).getByText('1/3')).toBeInTheDocument());
    expect(patches()).toEqual([{ displayName: 'Айгүл Осмонова' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Hello, Айгүл!' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Change: Your name' })).toBeInTheDocument();

    // 2. School + region
    await user.click(within(card).getByRole('button', { name: 'Fill in: Your school' }));
    await user.type(within(card).getByLabelText('School name'), 'Ош ш., №12 мектеп');
    await user.selectOptions(within(card).getByLabelText('Region'), 'osh-city');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(card).getByText('2/3')).toBeInTheDocument());
    expect(patches()[1]).toEqual({ schoolName: 'Ош ш., №12 мектеп', region: 'osh-city' });
    expect(within(card).getByText('Ош ш., №12 мектеп')).toBeInTheDocument();

    // 3. Subjects and grades
    await user.click(within(card).getByRole('button', { name: 'Fill in: Subjects and grades' }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(within(card).getByText('Choose at least one subject')).toBeInTheDocument();
    await user.click(await within(card).findByRole('button', { name: /Physics/ }));
    await user.click(within(card).getByRole('button', { name: 'Grade 8' }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Finish setting up your account' })).not.toBeInTheDocument());
    expect(patches()[2]).toEqual({ teaching: { subjects: ['phys'], grades: [8] } });
    expect(useSession.getState().me?.setup).toEqual({ name: true, school: true, teaching: true });
  });

  it('is not shown to a teacher who finished the setup, nor to a school-licensed teacher', async () => {
    await signIn({ phone: READY_PHONE });
    const view = open();
    expect(screen.getByRole('heading', { level: 1, name: 'Hello, Айгүл!' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Finish setting up your account' })).not.toBeInTheDocument();
    view.unmount();

    resetSession();
    await signIn({ email: TEACHER_EMAIL });
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Hello, Гүлнара!' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Finish setting up your account' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Free trial/)).not.toBeInTheDocument();
  });
});

describe('My classes', () => {
  it('starts with an empty state and one action; a new class gets its subject and opens', async () => {
    await signIn({ phone: READY_PHONE });
    const user = userEvent.setup();
    open();
    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
    const adds = screen.getAllByRole('button', { name: 'Add a class' });
    expect(adds).toHaveLength(1);
    await user.click(adds[0]);

    const sheet = screen.getByRole('dialog', { name: 'New class' });
    expect(within(sheet).getByLabelText('Class name')).toHaveFocus();
    const subject = within(sheet).getByLabelText('Subject');
    await waitFor(() => expect(within(subject).getAllByRole('option').map((o) => o.textContent)).toEqual(['No subject', 'Biology', 'Chemistry']));
    await user.click(within(sheet).getByRole('button', { name: 'Add class' }));
    expect(within(sheet).getByText('Enter the class name')).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Class name'), '9В');
    await user.selectOptions(within(sheet).getByLabelText('Grade'), '9');
    await user.selectOptions(subject, 'chem');
    await user.click(within(sheet).getByRole('button', { name: 'Add class' }));

    expect(await screen.findByRole('heading', { level: 1, name: '9В' })).toBeInTheDocument();
    expect(sent.find((r) => r.method === 'POST' && r.path.endsWith('/classes'))?.body).toEqual({ name: '9В', grade: 9, subjectKey: 'chem' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Chemistry')).toBeInTheDocument();
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
  });

  it('closes the sheet with Escape without creating anything', async () => {
    await signIn({ email: TEACHER_EMAIL });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Add a class' }));
    expect(screen.getByRole('dialog', { name: 'New class' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent.some((r) => r.path.endsWith('/classes'))).toBe(false);
  });
});

describe('Inside a class', () => {
  it('has breadcrumbs and a sub-navigation: students, assignments, results, join code, settings', async () => {
    await signIn({ email: TEACHER_EMAIL });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('link', { name: 'Open class “7А”' }));
    expect(await screen.findByRole('heading', { level: 1, name: '7А' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getByText('7А')).toHaveAttribute('aria-current', 'page');
    const nav = screen.getByRole('tablist', { name: 'Class sections' });
    expect(within(nav).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Students', 'Assignments', 'Results', 'Join code', 'Settings']);
    expect(within(nav).getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true');
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

    // Settings: change the subject.
    await user.click(within(nav).getByRole('tab', { name: 'Settings' }));
    const subject = screen.getByLabelText('Subject');
    await waitFor(() => expect(within(subject).getAllByRole('option').length).toBe(5));
    await user.selectOptions(subject, 'bio');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent.find((r) => r.method === 'PATCH' && r.path.includes('/classes/'))?.body).toEqual({ subjectKey: 'bio' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '7А' }).nextElementSibling).toHaveTextContent('Biology'));

    // Back to the cabinet.
    await user.click(within(crumbs).getByRole('link', { name: 'Teacher dashboard' }));
    expect(await screen.findByRole('link', { name: 'Open class “7А”' })).toBeInTheDocument();
  });

  it('adds students from a CSV file and shows their PINs on sign-in cards', async () => {
    await signIn({ email: TEACHER_EMAIL });
    const user = userEvent.setup();
    open('/en/teacher?class=0192a000-0000-7000-8000-0000000000c1');
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
  it('shows the WhatsApp number read-only and edits the name with PATCH /me', async () => {
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
  it('renders every section with no fixed width over 360 px and 44px buttons', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    window.dispatchEvent(new Event('resize'));
    await signIn({ phone: FRESH_PHONE });
    const user = userEvent.setup();
    const { container } = open();
    expect(screen.getByRole('region', { name: 'Finish setting up your account' })).toBeInTheDocument();
    const check = () => {
      const wide = [...container.querySelectorAll<HTMLElement>('[class]')].filter((el) => {
        const m = /(?:^|\s)(?:w|min-w)-\[(\d+)px\]/.exec(el.className);
        return m && Number(m[1]) > 360;
      });
      expect(wide).toEqual([]);
      const small = [...container.querySelectorAll<HTMLElement>('button')].filter((b) => /(^|\s)(btn|chip|pick)/.test(b.className) === false && !/min-h-11|size-11/.test(b.className));
      expect(small.map((b) => b.textContent)).toEqual([]);
    };
    for (const tab of ['My textbook', 'Profile and school', 'My classes']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      check();
    }
  });
});
