import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../i18n';
import { useSession } from '../api/session';
import { renderPage, resetSession } from '../cabinet/testUtils';
import { CLASS_CODE, STUDENT_PIN, TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import LoginPage from './LoginPage';

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});

describe('LoginPage — student (TZ §6, scenario «Ученик» 1)', () => {
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

  it('shows a localized error for an unknown class code', async () => {
    const user = userEvent.setup();
    renderPage('/en/login', '/:lang/login', <LoginPage />);
    await user.type(screen.getByLabelText('Class code'), 'ZZZ999');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('There is no class with this code')).toBeInTheDocument();
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
    expect(useSession.getState().status).toBe('guest');
  });
});

describe('LoginPage — adult', () => {
  it('wrong password → generic error; correct → teacher cabinet', async () => {
    const user = userEvent.setup();
    renderPage('/en/login', '/:lang/login', <LoginPage />);
    await user.click(screen.getByRole('tab', { name: /Teacher or staff/ }));
    await user.type(screen.getByLabelText('E-mail'), TEACHER_EMAIL);
    await user.type(screen.getByLabelText('Password'), 'wrong-password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect sign-in details')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), TEACHER_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(useSession.getState().permissions).toContain('class.manage'));
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
  });
});
