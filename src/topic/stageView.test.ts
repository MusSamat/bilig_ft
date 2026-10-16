// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collapseStage, onFullscreenChange, resetStageView, toggleFullscreen, toggleStage, useStageView } from './stageView';

const setFullscreenElement = (el: Element | null) => Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });

describe('3D focus view state', () => {
  afterEach(() => {
    setFullscreenElement(null);
    resetStageView();
    vi.restoreAllMocks();
  });

  it('toggles the in-page view', () => {
    toggleStage();
    expect(useStageView.getState().expanded).toBe(true);
    toggleStage();
    expect(useStageView.getState().expanded).toBe(false);
  });

  it('fullscreen opens the view; leaving fullscreen (Esc/F11) restores what was open before', async () => {
    const request = vi.fn(async () => {
      setFullscreenElement(document.documentElement);
      onFullscreenChange();
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });

    await toggleFullscreen();
    expect(request).toHaveBeenCalled();
    expect(useStageView.getState()).toMatchObject({ expanded: true, fullscreen: true });

    setFullscreenElement(null);
    onFullscreenChange();
    expect(useStageView.getState()).toMatchObject({ expanded: false, fullscreen: false });

    // From the open view: leaving fullscreen keeps the view.
    toggleStage();
    await toggleFullscreen();
    setFullscreenElement(null);
    onFullscreenChange();
    expect(useStageView.getState()).toMatchObject({ expanded: true, fullscreen: false });
    collapseStage();
    expect(useStageView.getState().expanded).toBe(false);
  });
});
