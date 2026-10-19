import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../i18n';
import { loginAdult } from '../api/session';
import { renderPage, resetSession } from '../cabinet/testUtils';
import { TEACHER_EMAIL, TEACHER_PASSWORD } from '../mocks/db';
import TeacherPage from './TeacherPage';

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});

describe('TeacherPage (W-53)', () => {
  it('is hidden for guests', () => {
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    expect(screen.getByText(/This page is for teachers/)).toBeInTheDocument();
  });

  it('creates a class, imports a CSV and shows the new PINs on login cards', async () => {
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    expect(await screen.findByRole('button', { name: 'Open class “7А”' }, { timeout: 5000 })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Class name'), '8Б');
    await user.selectOptions(screen.getByLabelText('Grade'), '8');
    await user.click(screen.getByRole('button', { name: 'Create class' }));
    expect(await screen.findByRole('button', { name: 'Open class “8Б”' })).toBeInTheDocument();
    expect(await screen.findByText('No students yet')).toBeInTheDocument();

    const file = new File(['name\nАйгүл Б.\nТимур С.\n'], 'list.csv', { type: 'text/csv' });
    const input = screen.getByLabelText('Import a CSV file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const cards = await screen.findAllByTestId('card-pin');
    expect(cards).toHaveLength(2);
    cards.forEach((c) => expect(c.textContent).toMatch(/^\d{4}$/));
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('Тимур С.')).toBeInTheDocument());
  });

  it('gives an assignment and shows results', async () => {
    await loginAdult(TEACHER_EMAIL, TEACHER_PASSWORD);
    const user = userEvent.setup();
    renderPage('/en/teacher', '/:lang/teacher', <TeacherPage />);
    await user.click(await screen.findByRole('button', { name: 'Open class “7А”' }));
    await user.click(screen.getByRole('tab', { name: 'Results' }));
    expect(await screen.findByText(/0 of 5 done/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Assignments' }));
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(2));
    await user.selectOptions(screen.getByLabelText('Topic'), 'water');
    await user.click(screen.getByRole('button', { name: 'Give assignment' }));
    await waitFor(() => expect(screen.getAllByText('Water').length).toBeGreaterThan(1));
  });
});
