/**
 * Focus view of the 3D stage: the same `.stage` element (same canvas, camera,
 * focus, visibility and process step) shown as a ~94% modal, optionally in
 * browser fullscreen for whiteboards. The fullscreen target is the whole
 * document, so the floating assistant stays usable on top of the model.
 */
import { create } from 'zustand';

interface StageView {
  expanded: boolean;
  fullscreen: boolean;
  /** Concept drawer inside the focus view (opens on selection). */
  drawer: boolean;
}

export const useStageView = create<StageView>(() => ({ expanded: false, fullscreen: false, drawer: true }));

/** Was the focus view already open when fullscreen started (restore it on exit)? */
let expandedBeforeFullscreen = false;

export const fullscreenSupported = (): boolean =>
  typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false;

export function expandStage(): void {
  useStageView.setState({ expanded: true });
}

export function collapseStage(): void {
  if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  useStageView.setState({ expanded: false, fullscreen: false });
}

export function toggleStage(): void {
  if (useStageView.getState().expanded) collapseStage();
  else expandStage();
}

export async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen?.().catch(() => undefined);
    return;
  }
  expandedBeforeFullscreen = useStageView.getState().expanded;
  useStageView.setState({ expanded: true });
  if (!fullscreenSupported()) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* refused (iframe, no user gesture): the in-page focus view stays open */
  }
}

/** Keep the store in sync with the browser (Esc / F11 leave fullscreen without us). */
export function onFullscreenChange(): void {
  const fs = !!document.fullscreenElement;
  if (fs) useStageView.setState({ fullscreen: true, expanded: true });
  else useStageView.setState((s) => ({ fullscreen: false, expanded: s.fullscreen ? expandedBeforeFullscreen : s.expanded }));
}

export function resetStageView(): void {
  if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  useStageView.setState({ expanded: false, fullscreen: false, drawer: true });
}
