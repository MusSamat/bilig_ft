import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { loginAdult, registerTeacher, useSession, verifyRegistration } from '../../api/session';
import { REGISTER_CODE, TEACHER_EMAIL, TEACHER_PASSWORD } from '../../mocks/db';
import { server } from '../../mocks/node';
import TeacherPage from '../../pages/TeacherPage';
import { renderPage, resetSession } from '../testUtils';
import { formatGrades } from './TeachingPicker';

const captured: { method: string; path: string; body: unknown }[] = [];

beforeEach(async () => {
  resetSession();
  captured.length = 0;
  await i18n.changeLanguage('en');
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'PATCH' || request.method === 'POST') {
      captured.push({ method: request.method, path: new URL(request.url).pathname, body: await request.clone().json().catch(() => null) });
    }
  });
});
afterEach(() => server.events.removeAllListeners());

async function signUpTrialTeacher() {
  await act(async () => {
    await registerTeacher({ email: 'new@school.kg', password: 'blue-river-2026', displayName: 'Нурлан Б.', locale: 'en', teaching: { subjects: ['chem'], grades: [8, 9] } });
    await verifyRegistration('new@school.kg', REGISTER_CODE);
  });
}

describe('«My subjects» card', () => {
  it('a trial teacher edits subjects and grades with PATCH /me { teaching }', async () => {
    await signUpTrialTeacher();
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    const card = await screen.findByRole('region', { name: 'My subjects' });
    expect(within(card).getByText('Нурлан Б.')).toBeInTheDocument(); // workspace named after the teacher
    expect(within(card).getByText(/Trial: 30 days left/)).toBeInTheDocument();
    expect(within(card).getAllByText('8, 9').length).toBeGreaterThan(0);

    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    await user.click(await within(card).findByRole('button', { name: /Physics/ }));
    await user.click(within(card).getByRole('button', { name: /Chemistry/ })); // off
    await user.click(within(card).getByRole('button', { name: 'Grade 10' }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(within(card).getByRole('button', { name: 'Edit' })).toHaveFocus());
    expect(captured.find((r) => r.method === 'PATCH' && r.path.endsWith('/me'))?.body).toEqual({ teaching: { subjects: ['phys'], grades: [8, 9, 10] } });
    expect(useSession.getState().me?.teaching).toEqual({ subjects: ['phys'], grades: [8, 9, 10] });
    expect(useSession.getState().me?.licenses?.[0].subjects).toEqual(['phys']);
    expect(within(card).getAllByText('8–10').length).toBeGreaterThan(0);
  });

  it('keeps at least one subject', async () => {
    await signUpTrialTeacher();
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    const card = await screen.findByRole('region', { name: 'My subjects' });
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    await user.click(await within(card).findByRole('button', { name: /Chemistry/ }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(within(card).getByText('Choose at least one subject')).toBeInTheDocument();
    expect(captured.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it("a school licence is read-only: no editor, a note to contact the school admin", async () => {
    await act(async () => {
      await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    });
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    const card = await screen.findByRole('region', { name: 'My subjects' });
    expect(within(card).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(card).getByText(/managed by your school admin/)).toBeInTheDocument();
    expect(within(card).queryByText(/Trial/)).not.toBeInTheDocument();
  });
});

describe('Class subject (v0.6.0)', () => {
  it('the create form offers only licensed subjects and the new class shows its subject chip', async () => {
    await act(async () => {
      await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    });
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    await screen.findByRole('button', { name: 'Open class “7А”' });
    const select = screen.getByLabelText('Subject (optional)');
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(5));
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['No subject', 'Biology', 'Chemistry', 'Physics', 'Mathematics']);

    await user.type(screen.getByLabelText('Class name'), '9В');
    await user.selectOptions(screen.getByLabelText('Grade'), '9');
    await user.selectOptions(select, 'phys');
    await user.click(screen.getByRole('button', { name: 'Create class' }));
    const row = await screen.findByRole('button', { name: 'Open class “9В”' });
    expect(within(row).getByText('Physics')).toBeInTheDocument();
    expect(captured.find((r) => r.path.endsWith('/classes'))?.body).toEqual({ name: '9В', grade: 9, subjectKey: 'phys' });
  });

  it('class settings change the subject with PATCH /classes/:id', async () => {
    await act(async () => {
      await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    });
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    await user.click(await screen.findByRole('button', { name: 'Open class “7А”' }));
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    const select = screen.getByLabelText('Subject (optional)', { selector: '#class-edit-subject' });
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(5));
    await user.selectOptions(select, 'bio');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(captured.find((r) => r.method === 'PATCH')?.body).toEqual({ subjectKey: 'bio' }));
    const row = await screen.findByRole('button', { name: 'Open class “7А”' });
    await waitFor(() => expect(within(row).getByText('Biology')).toBeInTheDocument());
  });
});

describe('formatGrades', () => {
  it('collapses runs of three or more', () => {
    expect(formatGrades([5, 6, 7, 9, 11, 10])).toBe('5–7, 9–11');
    expect(formatGrades([8, 9])).toBe('8, 9');
  });
});
