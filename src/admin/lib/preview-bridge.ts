/**
 * Extension point for the live 3D preview (A-06/A-07/A-08). The admin renders
 * a structured preview card today; when the viewer core (`@bilig/scene-core`
 * + plugins) is shared with the admin, a viewer component calls
 * `setPreviewBridge({...})` and every «сохранить текущий вид» / «показать в
 * превью» / «проиграть процесс» button lights up — no editor changes needed.
 */
import type { ComponentType } from 'react';
import { create } from 'zustand';
import type { Camera, ContentPackage, Lang, Visibility } from '@bilig/content-model';

export interface PreviewBridge {
  /** Current camera of the preview viewer. */
  getCamera?(): Camera | null;
  /** Current visibility (isolated / hidden concepts) of the preview. */
  getVisibility?(): Visibility | null;
  /** Concept currently focused in the preview. */
  getFocus?(): string | null;
  /** Scene node names of the loaded model (Structures tab: click a node → pick a concept). */
  getNodes?(): string[];
  /** Play a process in the preview. */
  playProcess?(processKey: string, step?: number): void;
}

export interface PreviewRendererProps {
  pkg: ContentPackage;
  lang: Lang;
}

interface BridgeState {
  bridge: PreviewBridge;
  /** A 3D renderer for the preview pane (null → the structured card). */
  renderer: ComponentType<PreviewRendererProps> | null;
  setBridge(b: PreviewBridge): void;
  setRenderer(r: ComponentType<PreviewRendererProps> | null): void;
}

export const usePreviewBridge = create<BridgeState>((set) => ({
  bridge: {},
  renderer: null,
  setBridge: (bridge) => set({ bridge }),
  setRenderer: (renderer) => set({ renderer }),
}));

export const setPreviewBridge = (b: PreviewBridge) => usePreviewBridge.getState().setBridge(b);
export const setPreviewRenderer = (r: ComponentType<PreviewRendererProps> | null) => usePreviewBridge.getState().setRenderer(r);
