/** The student sign-in is hidden (SHOW_STUDENT_LOGIN = false) but kept working: test it with the flag on. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../i18n';
import { useSession } from '../api/session';
import { renderPage, resetSession } from '../cabinet/testUtils';
import { CLASS_CODE, STUDENT_PIN } from '../mocks/db';
import LoginPage from './LoginPage';

vi.mock('../config', async (orig) => ({ ...(await orig<typeof import('../config')>()), SHOW_STUDENT_LOGIN: true }));

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});

describe('LoginPage — student (SHOW_STUDENT_LOGIN on)', () => {
  it('shows both tabs and the old lead', () => {
    renderPage('/en/login', '/:lang/login', <LoginPage />);
    expect(screen.getByRole('tab', { name: /I am a student/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Teacher or staff/ })).toBeInTheDocument();
    expect(screen.getByText(/Students sign in with a class code/)).toBeInTheDocument();
  });

  it('class code → pick name → PIN signs the student in', async () => {
    const user = userEvent.setup();
    renderPage('/en/login', '/:lang/login', <LoginPage />);
    await user.type(screen.getByLabelText('Class code'), CLASS_CODE.toLowerCase());
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Нургуль А.' }));
    await user.type(screen.getByLabelText('PIN'), STUDENT_PIN);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(useSession.getState().status).toBe('authed'));
    expect(useSession.getState().me?.kind).toBe('student');
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
  });

  it('rejects a wrong PIN', async () => {
    const user = userEvent.setup();
    renderPage('/en/login', '/:lang/login', <LoginPage />);
    await user.type(screen.getByLabelText('Class code'), CLASS_CODE);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Айбек Т.' }));
    await user.type(screen.getByLabelText('PIN'), '9999');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect sign-in details')).toBeInTheDocument();
  });

  it('the teacher tab has the phone form', async () => {
    const user = userEvent.setup();
    renderPage('/en/login', '/:lang/login', <LoginPage />);
    await user.click(screen.getByRole('tab', { name: /Teacher or staff/ }));
    expect(screen.getByLabelText('WhatsApp number')).toBeInTheDocument();
  });
});
