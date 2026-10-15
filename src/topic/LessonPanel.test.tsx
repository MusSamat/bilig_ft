import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderTopic } from '../test/utils';
import { useViewer } from '../state/viewer';
import { LessonPanel } from './LessonPanel';

describe('Lesson mode stepper (W-50)', () => {
  it('steps with arrows and presentation-remote PageUp/PageDown, applying focus and visibility', async () => {
    const user = userEvent.setup();
    const { pkg } = renderTopic(<LessonPanel ready />, { topic: 'water', lesson: true });
    const total = pkg.topic.activities.tour!.steps.length;
    expect(screen.getByText(`Step 1 of ${total}`)).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText(`Step 2 of ${total}`)).toBeInTheDocument();
    await user.keyboard('{PageDown}');
    expect(screen.getByText(`Step 3 of ${total}`)).toBeInTheDocument();
    expect(useViewer.getState().selected).toBe(pkg.topic.activities.tour!.steps[2].focus ?? null);
    await user.keyboard('{PageUp}');
    expect(screen.getByText(`Step 2 of ${total}`)).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByText(`Step ${total} of ${total}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText(`Step ${total - 1} of ${total}`)).toBeInTheDocument();
  });
});
