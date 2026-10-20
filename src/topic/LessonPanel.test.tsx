import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderTopic } from '../test/utils';
import { ensurePlugins } from '../scene/registry';
import { setWebGLAvailable } from '../scene/webgl';
import { useViewer } from '../state/viewer';
import { LessonBar, LessonPanel } from './LessonPanel';
import { Stage } from './Stage';

vi.mock('../scene/SceneViewer', () => ({ default: () => <div data-testid="scene" /> }));
beforeAll(async () => {
  await ensurePlugins();
});
beforeEach(() => setWebGLAvailable(true));
afterEach(() => setWebGLAvailable(null));

describe('Lesson mode stepper (W-50)', () => {
  it('steps with arrows and presentation-remote PageUp/PageDown, applying focus and visibility', async () => {
    const user = userEvent.setup();
    const { pkg } = renderTopic(<LessonBar ready />, { topic: 'water', lesson: true });
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

  it('Back / Next and the step counter live in the stage itself, always beside the model (audit L-1)', () => {
    renderTopic(<Stage ready />, { topic: 'water', lesson: true });
    const stage = screen.getByTestId('stage');
    const bar = within(stage).getByTestId('lesson-bar');
    // A direct part of the stage (not the bottom of a scrolling side panel).
    expect(bar.parentElement).toBe(stage);
    const next = within(bar).getByRole('button', { name: /Next/ });
    expect(within(bar).getByRole('button', { name: /Back/ })).toBeInTheDocument();
    expect(within(bar).getByText(/^Step 1 of \d+$/)).toBeInTheDocument();
    // Large targets (48px) for the projector.
    expect(next.className).toMatch(/\bmin-h-12\b/);
  });

  it('explore mode has no step bar', () => {
    renderTopic(<Stage ready />, { topic: 'water' });
    expect(screen.queryByTestId('lesson-bar')).toBeNull();
  });

  it('the card shows the lesson tools without a second Back / Next', () => {
    renderTopic(<LessonPanel />, { topic: 'water', lesson: true });
    expect(screen.getByRole('button', { name: /Present full view/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull();
  });
});
