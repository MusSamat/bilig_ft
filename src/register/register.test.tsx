import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { API_PREFIX, problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { loginAdult, signIn, useSession } from '../api/session';
import { resetSession } from '../cabinet/testUtils';
import { REGISTER_CODE, TEACHER_EMAIL, TEACHER_PASSWORD, TEACHER_PHONE, mockDb } from '../mocks/db';
import { server } from '../mocks/node';
import LoginPage from '../pages/LoginPage';
import { renderRoutes } from '../test/utils';
import RegisterPage from './RegisterPage';
import ResetPage from './ResetPage';

const NEW_PHONE = '+996700123456';
const PASSWORD = 'blue-river-2026';

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});
afterEach(() => server.events.removeAllListeners());

const renderAt = (path: string) =>
  renderRoutes(
    path,
    <>
      <Route path="/:lang/register" element={<RegisterPage />} />
      <Route path="/:lang/reset" element={<ResetPage />} />
      <Route path="/:lang/login" element={<LoginPage />} />
      <Route path="/:lang/teacher" element={<div data-testid="cabinet" />} />
      <Route path="*" element={<div data-testid="elsewhere" />} />
    </>,
  );

/** Request bodies per endpoint path (after /api/v1). */
function capture(): Record<string, unknown[]> {
  const seen: Record<string, unknown[]> = {};
  server.events.on('request:start', async ({ request }) => {
    const path = new URL(request.url).pathname.replace(API_PREFIX, '');
    if (request.method === 'POST') (seen[path] ??= []).push(await request.clone().json().catch(() => null));
  });
  return seen;
}

const boxes = () => screen.getAllByRole('textbox', { name: /^Digit \d of 6$/ }) as HTMLInputElement[];
const currentStep = () => screen.getByRole('list', { name: 'Steps' }).querySelector('[aria-current="step"]')?.textContent;

async function phoneStep(user: ReturnType<typeof userEvent.setup>, national = '700 12 34 56') {
  await waitFor(() => expect(screen.getByLabelText('WhatsApp number')).toHaveFocus());
  await user.type(screen.getByLabelText('WhatsApp number'), national);
  await user.click(screen.getByRole('button', { name: 'Get the code' }));
  await screen.findByRole('heading', { name: 'Enter the code from WhatsApp' });
}

async function codeStep() {
  await waitFor(() => expect(boxes()[0]).toHaveFocus());
  fireEvent.paste(boxes()[0], { clipboardData: { getData: () => REGISTER_CODE } });
  await screen.findByRole('heading', { name: 'Create a password' });
}

describe('Registration — 3 steps (contract 0.7.0)', () => {
  it('number → WhatsApp code → password signs in and opens the cabinet; nothing else is asked', async () => {
    const seen = capture();
    const user = userEvent.setup();
    renderAt('/en/register');
    expect(currentStep()).toMatch(/1\s*Number/);
    expect(screen.queryByLabelText(/name|e-mail|school/i)).not.toBeInTheDocument();

    await phoneStep(user);
    expect(currentStep()).toMatch(/2\s*Code/);
    expect(screen.getByText(/We sent a 6-digit code to WhatsApp on \+996 700 12 34 56\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(REGISTER_CODE);
    boxes().forEach((b) => expect(b).toHaveAttribute('inputmode', 'numeric'));

    await codeStep();
    expect(currentStep()).toMatch(/3\s*Password/);
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.type(screen.getByLabelText('Repeat the password'), PASSWORD);
    expect(screen.getByText('Passwords match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher?welcome=1'));
    expect(screen.getByTestId('cabinet')).toBeInTheDocument();
    const me = useSession.getState().me!;
    expect(useSession.getState().status).toBe('authed');
    expect(me.phone).toBe(NEW_PHONE);
    expect(me.permissions).toContain('class.manage');
    expect(me.setup).toEqual({ name: false, school: false, teaching: false });

    expect(seen['/auth/otp/start']).toEqual([{ phone: NEW_PHONE, purpose: 'register', locale: 'en' }]);
    expect(seen['/auth/otp/verify']).toEqual([{ phone: NEW_PHONE, purpose: 'register', code: REGISTER_CODE }]);
    const complete = seen['/auth/register/complete'] as { token: string; password: string }[];
    expect(complete).toHaveLength(1);
    expect(complete[0].password).toBe(PASSWORD);
    // The token lives in memory only.
    expect(JSON.stringify({ ...localStorage })).not.toContain(complete[0].token);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(complete[0].token);

    // The new account signs in with the number.
    await act(async () => {
      expect(await signIn({ phone: NEW_PHONE }, PASSWORD)).not.toBe('totp');
    });
  });

  it('validates the number before sending anything', async () => {
    const seen = capture();
    const user = userEvent.setup();
    renderAt('/en/register');
    await user.click(screen.getByRole('button', { name: 'Get the code' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your WhatsApp number');
    expect(screen.getByLabelText('WhatsApp number')).toHaveAttribute('aria-invalid', 'true');
    expect(seen['/auth/otp/start']).toBeUndefined();
  });

  it('a wrong code: error with the tries left, the boxes clear, focus returns to the first box', async () => {
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user);
    await waitFor(() => expect(boxes()[0]).toHaveFocus());
    await user.keyboard('999999'); // the sixth digit submits
    expect(await screen.findByText('Wrong code. 4 tries left')).toBeInTheDocument();
    await waitFor(() => expect(boxes().map((b) => b.value).join('')).toBe(''));
    expect(boxes()[0]).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(boxes()[0]).toHaveFocus());
    expect(useSession.getState().status).toBe('guest');
  });

  it('an expired code says so', async () => {
    server.use(http.post(`${API_PREFIX}/auth/otp/verify`, () => HttpResponse.json(problem('invalid_credentials', { detail: 'code_expired' }), { status: 401 })));
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user);
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => REGISTER_CODE } });
    expect(await screen.findByText('This code has expired. Get a new one')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create a password' })).not.toBeInTheDocument();
  });

  it('counts down before a new code can be requested, then resends', async () => {
    server.use(
      http.post(`${API_PREFIX}/auth/otp/start`, () => HttpResponse.json({ ok: true, channel: 'whatsapp', expiresIn: 600, resendAfter: 1 }), { once: true }),
    );
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user);
    expect(screen.getByTestId('resend-wait')).toHaveTextContent('You can get a new code in 0:01');
    expect(screen.queryByRole('button', { name: 'Send a new code' })).not.toBeInTheDocument();
    const resend = await screen.findByRole('button', { name: 'Send a new code' }, { timeout: 3000 });
    expect(screen.getByText('You can get a new code now')).toBeInTheDocument(); // said once by the live region
    mockDb.otps = {}; // the mock's own 60 s limit
    await user.click(resend);
    expect(await screen.findByText('A new code has been sent to WhatsApp')).toBeInTheDocument();
    expect(screen.getByTestId('resend-wait')).toHaveTextContent('1:00');
  });

  it('«Change the number» goes back to step 1 with the number kept', async () => {
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user);
    await user.click(screen.getByRole('button', { name: 'Change the number' }));
    await waitFor(() => expect(screen.getByLabelText('WhatsApp number')).toHaveFocus());
    expect(screen.getByLabelText('WhatsApp number')).toHaveValue('700 12 34 56');
  });

  it('passwords that do not match block the submit', async () => {
    const seen = capture();
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user);
    await codeStep();
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.type(screen.getByLabelText('Repeat the password'), 'blue-river-2027');
    expect(screen.getByLabelText('Repeat the password')).toHaveAccessibleDescription(/Passwords do not match/);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(seen['/auth/register/complete']).toBeUndefined();
    expect(useSession.getState().status).toBe('guest');
  });

  it('a short password is caught on blur; a leaked one by the server', async () => {
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user);
    await codeStep();
    await user.type(screen.getByLabelText('Password'), 'short');
    expect(screen.getByText('Too short: use at least 10 characters')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/must be at least 10 characters/);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'qwerty12345');
    await user.type(screen.getByLabelText('Repeat the password'), 'qwerty12345');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findAllByText(/appears in lists of leaked passwords/)).not.toHaveLength(0);
    expect(useSession.getState().status).toBe('guest');
  });

  it('409: an already registered number is offered sign-in or a password reset', async () => {
    const user = userEvent.setup();
    renderAt('/en/register');
    await phoneStep(user, '555 00 00 01');
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => REGISTER_CODE } });
    const title = await screen.findByRole('heading', { name: 'This number is already registered' });
    await waitFor(() => expect(title).toHaveFocus());
    const panel = screen.getByRole('region', { name: 'This number is already registered' });
    expect(within(panel).getByRole('link', { name: 'Reset password' })).toHaveAttribute('href', '/en/reset');
    await user.click(within(panel).getByRole('link', { name: 'Sign in' }));
    // The login form opens with the number filled in and the password focused.
    await waitFor(() => expect(screen.getByLabelText('WhatsApp number')).toHaveValue('555 00 00 01'));
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
  });

  it('offline: a clear message, not a generic error', async () => {
    server.use(http.post(`${API_PREFIX}/auth/otp/start`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderAt('/en/register');
    await user.type(screen.getByLabelText('WhatsApp number'), '700123456');
    await user.click(screen.getByRole('button', { name: 'Get the code' }));
    expect(await screen.findByText('No internet connection. Check it and try again')).toBeInTheDocument();
  });

  it('429 on sending the code: waits with a countdown', async () => {
    server.use(http.post(`${API_PREFIX}/auth/otp/start`, () => HttpResponse.json(problem('rate_limited', { retryAfter: 90 }), { status: 429 })));
    const user = userEvent.setup();
    renderAt('/en/register');
    await user.type(screen.getByLabelText('WhatsApp number'), '700123456');
    await user.click(screen.getByRole('button', { name: 'Get the code' }));
    expect(await screen.findByText('Too many attempts. Please wait a little')).toBeInTheDocument();
    expect(screen.getByTestId('retry-wait')).toHaveTextContent(/1:(30|29)/);
    expect(screen.getByRole('button', { name: 'Get the code' })).toBeDisabled();
  });

  it('a signed-in teacher is redirected to the cabinet', async () => {
    await act(async () => {
      await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    });
    renderAt('/en/register');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher'));
  });
});

describe('Password reset (contract 0.7.0)', () => {
  it('number → code → new password twice signs in; the new password works, the old one not', async () => {
    const seen = capture();
    const user = userEvent.setup();
    renderAt('/en/login');
    await user.type(screen.getByLabelText('WhatsApp number'), '555000001');
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    // The number typed on the login form comes along.
    await waitFor(() => expect(screen.getByLabelText('WhatsApp number')).toHaveValue('555 00 00 01'));
    expect(screen.getByRole('heading', { name: 'The number you registered with' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get the code' }));
    await screen.findByRole('heading', { name: 'Enter the code from WhatsApp' });
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => REGISTER_CODE } });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await user.type(screen.getByLabelText('New password'), 'new-river-2027');
    await user.type(screen.getByLabelText('Repeat the password'), 'new-river-2027');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/en/teacher'));
    expect(useSession.getState().me?.phone).toBe(TEACHER_PHONE);
    expect(seen['/auth/otp/start']).toEqual([{ phone: TEACHER_PHONE, purpose: 'reset', locale: 'en' }]);
    expect((seen['/auth/password/set'] as { password: string }[])[0].password).toBe('new-river-2027');
    await act(async () => {
      await expect(signIn({ phone: TEACHER_PHONE }, TEACHER_PASSWORD)).rejects.toMatchObject({ code: 'invalid_credentials' });
      expect(await signIn({ phone: TEACHER_PHONE }, 'new-river-2027')).not.toBe('totp');
    });
  });

  it('an expired token on the last step sends the user back to confirm the number', async () => {
    server.use(http.post(`${API_PREFIX}/auth/password/set`, () => HttpResponse.json(problem('invalid_credentials', { detail: 'token_expired' }), { status: 401 })));
    const user = userEvent.setup();
    renderAt('/en/reset');
    await phoneStep(user, '555000001');
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => REGISTER_CODE } });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await user.type(screen.getByLabelText('New password'), 'new-river-2027');
    await user.type(screen.getByLabelText('Repeat the password'), 'new-river-2027');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));
    expect(await screen.findByText('Time is up. Please confirm your number again')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm the number again' }));
    await waitFor(() => expect(screen.getByLabelText('WhatsApp number')).toHaveFocus());
  });
});
