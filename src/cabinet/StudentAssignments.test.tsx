import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import i18n from '../i18n';
import { loginStudent } from '../api/session';
import { CLASS_ID, STUDENT_PIN } from '../mocks/db';
import { StudentAssignments, dueState } from './StudentAssignments';
import { renderPage, resetSession } from './testUtils';

beforeEach(async () => {
  resetSession();
  await i18n.changeLanguage('en');
});

describe('StudentAssignments (W-54)', () => {
  it('lists the assignment with due date and a topic link carrying the assignment id', async () => {
    await loginStudent(CLASS_ID, '0192a000-0000-7000-8000-000000000501', STUDENT_PIN);
    renderPage('/en', '/:lang', <StudentAssignments />);
    const link = await screen.findByRole('link', { name: 'Open the topic “Animal cell”' });
    expect(link.getAttribute('href')).toMatch(/^\/en\/bio\/g7\/animal-cell\?assignment=/);
    expect(screen.getByText(/Due /)).toBeInTheDocument();
    expect(screen.getByText('To do')).toBeInTheDocument();
  });

  it('flags overdue and due-soon assignments', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    expect(dueState({ dueAt: '2026-10-14T12:00:00Z', status: 'not_started' }, now)).toBe('overdue');
    expect(dueState({ dueAt: '2026-10-16T12:00:00Z', status: 'not_started' }, now)).toBe('soon');
    expect(dueState({ dueAt: '2026-10-25T12:00:00Z', status: 'not_started' }, now)).toBeNull();
    expect(dueState({ dueAt: '2026-10-14T12:00:00Z', status: 'done' }, now)).toBeNull();
  });
});
