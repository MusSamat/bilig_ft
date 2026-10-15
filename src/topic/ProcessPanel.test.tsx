import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderTopic } from '../test/utils';
import { useViewer } from '../state/viewer';
import { ProcessPanel } from './ProcessPanel';

describe('Process player (W-41…W-43)', () => {
  it('play/pause, speed, seek, segments, step cards and computed readouts', async () => {
    const user = userEvent.setup();
    renderTopic(<ProcessPanel ready />, { topic: 'water' });
    await waitFor(() => expect(useViewer.getState().process?.key).toBe('chem.water-electrolysis'));
    // stoich readouts at t=0: all water, no gases (computed from the equation + molar masses)
    expect(screen.getByTestId('readout-h2o')).toHaveTextContent('36');
    expect(screen.getByTestId('readout-o2')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(useViewer.getState().process!.state.playing).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useViewer.getState().process!.state.playing).toBe(false);

    await user.click(screen.getByRole('radio', { name: '2×' }));
    expect(useViewer.getState().process!.state.speed).toBe(2);

    fireEvent.change(screen.getByRole('slider', { name: 'Process position' }), { target: { value: '1000' } });
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByTestId('readout-h2o')).toHaveTextContent('0');
    expect(screen.getByTestId('readout-o2')).toHaveTextContent('32');

    const cards = screen.getAllByRole('button', { name: /^1/ });
    await user.click(cards[0]);
    expect(screen.getByText('0%')).toBeInTheDocument();
    act(() => useViewer.getState().playerDispatch({ type: 'seekStep', index: 1 }));
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('2');
  });
});
