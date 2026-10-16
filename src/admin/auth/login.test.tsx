import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../api/session';
import { fail, meFixture, mockApi, page, renderAdmin } from '../test/utils';

const token = (t: string) => ({ accessToken: t, tokenType: 'Bearer', expiresIn: 900 });

function fillPassword() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'editor@bilig.kg' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'correct horse battery' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('admin sign-in with TOTP', () => {
  it('restores nothing without a refresh cookie, then password → 401 totp_required → code → signed in', async () => {
    const api = mockApi({
      'POST /auth/refresh': fail('unauthorized'),
      'POST /auth/login': (c) => ((c.body as { totp?: string }).totp === '123456' ? { body: token('admin-access') } : fail('totp_required')),
      'GET /me': (c) => (c.headers.authorization === 'Bearer admin-access' ? { body: meFixture() } : fail('unauthorized')),
      'GET /admin/topics': { body: page([]) },
      'GET /admin/strings': { body: page([]) },
      'GET /admin/builds': { body: page([]) },
    });
    renderAdmin('/admin', { me: null });
    expect(await screen.findByRole('heading', { name: 'Вход в админку' })).toBeInTheDocument();
    const refresh = api.find('POST', '/auth/refresh')[0];
    expect(refresh.headers['x-bilig-audience']).toBe('admin');

    fillPassword();
    const code = await screen.findByLabelText('Код из приложения (6 цифр)');
    expect(api.find('POST', '/auth/login')[0].body).toEqual({ email: 'editor@bilig.kg', password: 'correct horse battery' });

    fireEvent.change(code, { target: { value: '12a' } });
    expect((code as HTMLInputElement).value).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText('Код — 6 цифр')).toBeInTheDocument();
    expect(api.find('POST', '/auth/login')).toHaveLength(1);

    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByRole('heading', { name: 'Дашборд' })).toBeInTheDocument();
    const logins = api.find('POST', '/auth/login');
    expect(logins[1].body).toEqual({ email: 'editor@bilig.kg', password: 'correct horse battery', totp: '123456' });
    expect(logins.every((l) => l.headers['x-bilig-audience'] === 'admin')).toBe(true);
    // access token only in memory
    expect(useSession.getState().token).toBe('admin-access');
    expect(JSON.stringify({ ...localStorage })).not.toContain('admin-access');
  });

  it('a wrong code shows the localized problem and stays on the code step', async () => {
    mockApi({
      'POST /auth/refresh': fail('unauthorized'),
      'POST /auth/login': (c) => ((c.body as { totp?: string }).totp ? fail('invalid_credentials') : fail('totp_required')),
    });
    renderAdmin('/admin', { me: null });
    await screen.findByLabelText('E-mail');
    fillPassword();
    fireEvent.change(await screen.findByLabelText('Код из приложения (6 цифр)'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText('Неверный e-mail, пароль или код')).toBeInTheDocument();
    expect(screen.getByLabelText('Код из приложения (6 цифр)')).toBeInTheDocument();
  });

  it('enrols an authenticator with the enrollmentToken from the 403 and signs straight in', async () => {
    const enrollmentToken = 'e'.repeat(43);
    const api = mockApi({
      'POST /auth/refresh': fail('unauthorized'),
      'POST /auth/login': fail('forbidden', { detail: 'totp_enrollment_required', enrollmentToken }),
      'POST /auth/2fa/setup': { body: { enabled: false, otpauthUrl: 'otpauth://totp/Bilig:editor?secret=ABCDEF234&issuer=Bilig' } },
      'POST /auth/2fa/verify': (c) => ((c.body as { code: string }).code === '654321' ? { body: token('admin-access') } : fail('invalid_credentials')),
      'GET /me': (c) => (c.headers.authorization === 'Bearer admin-access' ? { body: meFixture() } : fail('unauthorized')),
      'GET /admin/topics': { body: page([]) },
      'GET /admin/strings': { body: page([]) },
      'GET /admin/builds': { body: page([]) },
    });
    renderAdmin('/admin', { me: null });
    await screen.findByLabelText('E-mail');
    fillPassword();
    fireEvent.click(await screen.findByRole('button', { name: 'Подключить 2FA' }));
    expect(await screen.findByTestId('otpauth')).toHaveTextContent('otpauth://totp/Bilig:editor?secret=ABCDEF234');
    expect(screen.getByTestId('otp-secret')).toHaveTextContent('ABCDEF234');
    expect(api.find('POST', '/auth/2fa/setup')[0].body).toEqual({ enrollmentToken });

    // a wrong code stays on the step (no refresh-and-sign-out on its 401)
    fireEvent.change(screen.getByLabelText('Код из приложения (6 цифр)'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText('Неверный e-mail, пароль или код')).toBeInTheDocument();
    expect(api.find('POST', '/auth/refresh')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Код из приложения (6 цифр)'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByRole('heading', { name: 'Дашборд' })).toBeInTheDocument();
    expect(api.find('POST', '/auth/2fa/verify').map((c) => c.body)).toEqual([
      { enrollmentToken, code: '111111' },
      { enrollmentToken, code: '654321' },
    ]);
    // no client-audience workaround any more
    expect(api.calls.every((c) => c.headers['x-bilig-audience'] === 'admin')).toBe(true);
    expect(api.find('POST', '/me/2fa')).toHaveLength(0);
    expect(useSession.getState().token).toBe('admin-access');
  });

  it('refreshes once on 401 and retries the request with the new token', async () => {
    let n = 0;
    const api = mockApi({
      'POST /auth/refresh': { body: token('fresh') },
      'GET /admin/topics': (c) => (c.headers.authorization === 'Bearer fresh' ? { body: page([]) } : (n++, fail('unauthorized'))),
      'GET /admin/strings': { body: page([]) },
      'GET /admin/builds': { body: page([]) },
    });
    renderAdmin('/admin');
    await waitFor(() => expect(api.find('GET', '/admin/topics').some((c) => c.headers.authorization === 'Bearer fresh')).toBe(true));
    expect(n).toBeGreaterThan(0);
    expect(api.find('POST', '/auth/refresh')).toHaveLength(1);
    expect(useSession.getState().token).toBe('fresh');
  });
});
