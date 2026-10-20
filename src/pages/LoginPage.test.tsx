import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { useSession } from '../api/session';
import { resetSession } from '../cabinet/testUtils';
import { TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import { server } from '../mocks/node';
import { renderRoutes } from '../test/utils';
import LoginPage from './LoginPage';

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});
afterEach(() => server.events.removeAllListeners());

const renderLogin = (path = '/en/login') =>
  renderRoutes(
    path,
    <>
      <Route path="/:lang/login" element={<LoginPage />} />
      <Route path="*" element={<div data-testid="elsewhere" />} />
    </>,
  );

function captureLogin(): unknown[] {
  const bodies: unknown[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.url.endsWith('/auth/login')) bodies.push(await request.clone().json());
  });
  return bodies;
}

const phoneInput = () => screen.getByLabelText('WhatsApp number') as HTMLInputElement;

describe('LoginPage — contract 0.7.0', () => {
  it('shows only the teacher form: no student tab, number + password, links to reset and sign-up', () => {
    renderLogin();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('I am a student')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Class code')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in as a teacher' })).toBeInTheDocument();
    expect(screen.getByText('Teachers sign in with their WhatsApp number and password.')).toBeInTheDocument();
    const phone = phoneInput();
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).toHaveAttribute('inputmode', 'tel');
    expect(phone).toHaveAttribute('autocomplete', 'tel-national');
    expect(phone).toHaveAccessibleDescription(/\+996 is already filled in/);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/en/reset');
    expect(screen.getByRole('link', { name: /Create a teacher account/ })).toHaveAttribute('href', '/en/register');
  });

  it('formats the number live behind the fixed +996 and accepts pasted numbers in any spelling', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(phoneInput(), '0555123');
    expect(phoneInput()).toHaveValue('555 12 3');
    await user.type(phoneInput(), '4567');
    expect(phoneInput()).toHaveValue('555 12 34 56'); // capped at 9 digits
    await user.clear(phoneInput());
    fireEvent.paste(phoneInput(), { clipboardData: { getData: () => '+996 (700) 11-22-33' } });
    expect(phoneInput()).toHaveValue('700 11 22 33');
  });

  it('validates the number on blur and on submit (error summary takes focus)', async () => {
    const user = userEvent.setup();
    const bodies = captureLogin();
    renderLogin();
    await user.type(phoneInput(), '55512');
    await user.tab();
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput()).toHaveAccessibleDescription(/The number has 9 digits after \+996/);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const summary = screen.getByRole('alert');
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveTextContent('Could not sign in');
    expect(summary).toHaveTextContent('Enter your password');
    expect(bodies).toEqual([]);
  });

  it('signs a teacher in by number: sends {phone, password}; a wrong password gets a clear error', async () => {
    const user = userEvent.setup();
    const bodies = captureLogin();
    renderLogin();
    await user.type(phoneInput(), '555 00 00 01');
    await user.type(screen.getByLabelText('Password'), 'wrong-password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('The number or password is wrong. Check them and try again')).toHaveLength(2); // summary + under the password
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/The number or password is wrong/);
    expect(useSession.getState().status).toBe('guest');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), TEACHER_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher'));
    expect(useSession.getState().permissions).toContain('class.manage');
    expect(bodies.at(-1)).toEqual({ phone: '+996555000001', password: TEACHER_PASSWORD });
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    renderLogin();
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('«Sign in with e-mail» switches the identifier for staff and sends {email, password}', async () => {
    const user = userEvent.setup();
    const bodies = captureLogin();
    renderLogin();
    await user.click(screen.getByRole('button', { name: /Sign in with e-mail/ }));
    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveFocus();
    expect(screen.queryByLabelText('WhatsApp number')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
    await user.type(email, TEACHER_EMAIL.toUpperCase());
    await user.type(screen.getByLabelText('Password'), TEACHER_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher'));
    expect(bodies).toEqual([{ email: TEACHER_EMAIL, password: TEACHER_PASSWORD }]);
  });

  it('can switch back from e-mail to the number', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: /Sign in with e-mail/ }));
    await user.click(screen.getByRole('button', { name: 'Sign in with a WhatsApp number' }));
    expect(phoneInput()).toHaveFocus();
  });

  it('429: tells the user to wait and counts down before the next try', async () => {
    server.use(
      http.post(`${API_PREFIX}/auth/login`, () => HttpResponse.json(problem('rate_limited', { retryAfter: 30 }), { status: 429 })),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(phoneInput(), '555000001');
    await user.type(screen.getByLabelText('Password'), 'whatever-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Too many attempts. Please wait a little')).toBeInTheDocument();
    expect(screen.getByText(/You can try again in 0:(30|29)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('offline: says so instead of a generic error', async () => {
    server.use(http.post(`${API_PREFIX}/auth/login`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderLogin();
    await user.type(phoneInput(), '555000001');
    await user.type(screen.getByLabelText('Password'), TEACHER_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('No internet connection. Check it and try again')).toBeInTheDocument();
  });
});

describe('LoginPage — return to where the user came from', () => {
  it('signs in and goes to `?next=` (same-site paths only)', async () => {
    const user = userEvent.setup();
    renderLogin(`/en/login?next=${encodeURIComponent('/en/bio/g8/human-heart?focus=bio.aorta')}`);
    await user.type(phoneInput(), '555000001');
    await user.type(screen.getByLabelText('Password'), TEACHER_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/bio/g8/human-heart?focus=bio.aorta'));
  });

  it('ignores an off-site `next`', async () => {
    const user = userEvent.setup();
    renderLogin(`/en/login?next=${encodeURIComponent('//evil.example/x')}`);
    await user.type(phoneInput(), '555000001');
    await user.type(screen.getByLabelText('Password'), TEACHER_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher'));
  });
});
