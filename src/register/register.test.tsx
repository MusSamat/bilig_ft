import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { API_PREFIX } from '@bilig/content-model/api';
import i18n from '../i18n';
import { loginAdult, useSession } from '../api/session';
import { resetSession } from '../cabinet/testUtils';
import { REGISTER_CODE, TEACHER_EMAIL, TEACHER_PASSWORD, mockDb } from '../mocks/db';
import { server } from '../mocks/node';
import TeacherPage from '../pages/TeacherPage';
import { renderRoutes } from '../test/utils';
import RegisterPage from './RegisterPage';

const EMAIL = 'aigul@school.kg';

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});
afterEach(() => server.events.removeAllListeners());

const renderRegister = () =>
  renderRoutes(
    '/en/register',
    <>
      <Route path="/:lang/register" element={<RegisterPage />} />
      <Route path="/:lang/teacher" element={<TeacherPage />} />
      <Route path="*" element={<div data-testid="elsewhere" />} />
    </>,
  );

async function fillStep1(user: ReturnType<typeof userEvent.setup>, password = 'blue-river-2026') {
  await user.type(screen.getByLabelText('Full name'), 'Айгүл Токтогулова');
  await user.type(screen.getByLabelText('E-mail'), EMAIL);
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('School (optional)'), 'School No. 12');
  await user.selectOptions(screen.getByLabelText('Region (optional)'), 'chui');
  await user.click(await screen.findByRole('button', { name: /Physics/ }));
  await user.click(screen.getByRole('button', { name: 'Grade 8' }));
  await user.click(screen.getByRole('button', { name: 'Grade 9' }));
}

const boxes = () => screen.getAllByRole('textbox', { name: /^Digit \d of 6$/ }) as HTMLInputElement[];

describe('RegisterPage — step 1 (contract 0.6.0)', () => {
  it('validates the form, links errors to fields and focuses the first invalid one', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    const name = screen.getByLabelText('Full name');
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Enter your name');
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(/Enter your e-mail/);
    expect(screen.getByText('Choose at least one subject')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one grade')).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    expect(screen.getByText('Too short: use at least 10 characters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(/Check the e-mail/);
    expect(screen.getByText('The password must be at least 10 characters')).toBeInTheDocument();
  });

  it('shows/hides the password and offers only live subjects', async () => {
    const user = userEvent.setup();
    renderRegister();
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('button', { name: /Biology/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Computer science|Informatics/ })).not.toBeInTheDocument();
    // 1–4 open on demand.
    expect(screen.queryByRole('button', { name: 'Grade 3' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grades 1–4' }));
    expect(screen.getByRole('button', { name: 'Grade 3' })).toBeInTheDocument();
  });

  it('shows a leaked-password error from the server on the password field', async () => {
    const user = userEvent.setup();
    renderRegister();
    await fillStep1(user, 'qwerty12345');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    expect(await screen.findByText(/appears in lists of leaked passwords/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Enter the code' })).not.toBeInTheDocument();
  });
});

describe('RegisterPage — step 2: the e-mail code', () => {
  it('sends the request body, switches steps and never shows the code', async () => {
    const bodies: unknown[] = [];
    server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith('/auth/register')) bodies.push(await request.clone().json());
    });
    const user = userEvent.setup();
    renderRegister();
    await fillStep1(user);
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    await waitFor(() => expect(boxes()[0]).toHaveFocus());
    expect(screen.getByText(new RegExp(`We sent a 6-digit code to ${EMAIL}`))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(REGISTER_CODE);
    expect(bodies[0]).toEqual({
      email: EMAIL,
      password: 'blue-river-2026',
      displayName: 'Айгүл Токтогулова',
      locale: 'en',
      teaching: { subjects: ['phys'], grades: [8, 9] },
      schoolName: 'School No. 12',
      region: 'chui',
    });
    boxes().forEach((b) => expect(b).toHaveAttribute('inputmode', 'numeric'));
  });

  it('a wrong code shows an error, clears the boxes and counts the attempt', async () => {
    const user = userEvent.setup();
    renderRegister();
    await fillStep1(user);
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await screen.findByRole('heading', { name: 'Enter the code' });
    await user.keyboard('999999'); // typing moves box to box; the sixth digit submits
    expect(await screen.findByText(/Wrong code/)).toBeInTheDocument();
    await waitFor(() => expect(boxes().map((b) => b.value).join('')).toBe(''));
    expect(boxes()[0]).toHaveAttribute('aria-invalid', 'true');
    expect(mockDb.registrations[EMAIL].attempts).toBe(1);
    expect(useSession.getState().status).toBe('guest');
  });

  it('a pasted code auto-submits and lands in the cabinet with the welcome banner', async () => {
    const user = userEvent.setup();
    renderRegister();
    await fillStep1(user);
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await screen.findByRole('heading', { name: 'Enter the code' });
    fireEvent.paste(boxes()[2], { clipboardData: { getData: () => ` ${REGISTER_CODE.slice(0, 3)}-${REGISTER_CODE.slice(3)} ` } });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher?welcome=1'));
    expect(useSession.getState().status).toBe('authed');
    expect(useSession.getState().me?.teaching).toEqual({ subjects: ['phys'], grades: [8, 9] });
    const banner = await screen.findByRole('region', { name: /Welcome, Айгүл Токтогулова!/ });
    expect(within(banner).getByText(/30-day trial/)).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Create a class' })).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'Go to textbooks' })).toBeInTheDocument();
    // «My subjects» shows the trial licence named after the school.
    const card = screen.getByRole('region', { name: 'My subjects' });
    expect(within(card).getByText('School No. 12')).toBeInTheDocument();
    expect(within(card).getByText(/Trial: 30 days left/)).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: /Welcome/ })).not.toBeInTheDocument();
  });

  it('«Wrong e-mail?» goes back to step 1 with the fields kept', async () => {
    const user = userEvent.setup();
    renderRegister();
    await fillStep1(user);
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await user.click(await screen.findByRole('button', { name: 'Wrong e-mail? Change it' }));
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toHaveFocus());
    expect(screen.getByLabelText('E-mail')).toHaveValue(EMAIL);
    expect(screen.getByLabelText('Full name')).toHaveValue('Айгүл Токтогулова');
    expect(screen.getByRole('button', { name: /Physics/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Grade 9' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('counts down before a new code can be requested, then resends', async () => {
    server.use(http.post(`${API_PREFIX}/auth/register`, () => HttpResponse.json({ ok: true, expiresIn: 900, resendAfter: 1 })));
    const user = userEvent.setup();
    renderRegister();
    await fillStep1(user);
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    expect(await screen.findByTestId('resend-wait')).toHaveTextContent('No code? You can request a new one in 1 second');
    expect(screen.queryByRole('button', { name: 'No code? Send it again' })).not.toBeInTheDocument();
    const resend = await screen.findByRole('button', { name: 'No code? Send it again' }, { timeout: 3000 });
    server.use(http.post(`${API_PREFIX}/auth/register/resend`, () => HttpResponse.json({ ok: true, expiresIn: 900, resendAfter: 60 })));
    await user.click(resend);
    expect(await screen.findByText('A new code has been sent')).toBeInTheDocument();
    expect(screen.getByTestId('resend-wait')).toHaveTextContent('60 seconds');
  });
});

describe('RegisterPage — guards', () => {
  it('a signed-in teacher is redirected to the cabinet', async () => {
    await act(async () => {
      await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    });
    renderRegister();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher'));
  });
});
