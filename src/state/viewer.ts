/**
 * Topic viewer state (zustand): selection (W-21/W-31), scene modes (W-23),
 * toolbar visibility (W-24), process playback (W-41), assistant citations
 * (W-32), lesson step (W-50) and quiz «find on model» capture (W-45).
 * Pure transitions come from @bilig/scene-core — this store only holds them.
 */
import { create } from 'zustand';
import type { Camera, ResolvedConcept, Sample, Topic } from '@bilig/content-model';
import {
  applyModes,
  conceptVisibility,
  decodeModes,
  defaultModeState,
  hideOthers,
  isolateSelected,
  player,
  selectByKey,
  toggleMode,
  type ConceptVisibility,
  type ModeDef,
  type ModeState,
  type PlayerAction,
  type PlayerState,
} from '@bilig/scene-core';

export type ToolbarMode = 'none' | 'isolate' | 'hide';

export interface ViewerStore {
  topicKey: string | null;
  conceptKeys: string[];
  modeDefs: ModeDef[];
  selected: string | null;
  /** Structure under the pointer (hover highlight + name label). */
  hovered: string | null;
  modes: ModeState;
  toolbar: ToolbarMode;
  /** Visibility forced by a tour step (lesson mode); toolbar applies otherwise. */
  stepVisibility: Record<string, ConceptVisibility> | null;
  cited: string[];
  process: { key: string; state: PlayerState } | null;
  lessonStep: number;
  /** When set, a click on the model answers this quiz item instead of selecting. */
  findItemKey: string | null;
  /** Last «find on model» pick for `findItemKey`. */
  findAnswer: { itemKey: string; conceptKey: string } | null;
  /** Incremented to ask the camera to return to the topic view. */
  resetNonce: number;
  /** Camera override for a tour step. */
  stepCamera: Camera | null;
  /** v0.5.0: sample shown on the stage (its `scene` applies); null = the topic scene. */
  sample: string | null;
  /** The stage sample's camera: the stage's home view while it is shown. */
  sampleCamera: Camera | null;
  /** The stage sample's mode patch (re-applied by «Сброс»). */
  sampleModes: Record<string, boolean | string> | null;

  initTopic(topic: Topic, concepts: ResolvedConcept[], defs: ModeDef[], init: { focus?: string | null; modeTokens?: string[] }): void;
  select(key: string | null): void;
  setHovered(key: string | null): void;
  setModes(modes: ModeState): void;
  toggleMode(id: string): void;
  applyModePatch(patch: Record<string, boolean | string>): void;
  isolate(): void;
  hideOthers(): void;
  resetView(): void;
  setCited(keys: string[]): void;
  openProcess(key: string | null, steps?: readonly { duration?: number }[], stepIndex?: number): void;
  playerDispatch(action: PlayerAction): void;
  setLessonStep(i: number): void;
  setStepFrame(frame: { visibility: Record<string, ConceptVisibility> | null; camera: Camera | null }): void;
  setFindItem(key: string | null): void;
  /**
   * Put a sample on the stage (null = the topic scene). `defs` are the mode
   * definitions of the resulting scene (params may change them). Clears the
   * focus; the sample's modes apply over the defaults.
   */
  showSample(sample: Pick<Sample, 'key' | 'scene'> | null, defs: ModeDef[]): void;
  /** Route a pick (3D click or structure tree) to the quiz when in find mode, else select. */
  pick(key: string | null): void;
}

export const useViewer = create<ViewerStore>((set, get) => ({
  topicKey: null,
  conceptKeys: [],
  modeDefs: [],
  selected: null,
  hovered: null,
  modes: {},
  toolbar: 'none',
  stepVisibility: null,
  cited: [],
  process: null,
  lessonStep: 0,
  findItemKey: null,
  findAnswer: null,
  resetNonce: 0,
  stepCamera: null,
  sample: null,
  sampleCamera: null,
  sampleModes: null,

  initTopic(topic, concepts, defs, init) {
    // Modes reset to the plugin defaults whenever the topic changes (W-23).
    const modes = init.modeTokens?.length ? decodeModes(init.modeTokens, defs) : defaultModeState(defs);
    set({
      topicKey: topic.key,
      conceptKeys: concepts.map((c) => c.key),
      modeDefs: defs,
      modes,
      selected: selectByKey(concepts, init.focus ?? null),
      hovered: null,
      toolbar: 'none',
      stepVisibility: null,
      stepCamera: null,
      sample: null,
      sampleCamera: null,
      sampleModes: null,
      cited: [],
      process: null,
      lessonStep: 0,
      findItemKey: null,
      findAnswer: null,
    });
  },
  select(key) {
    const { conceptKeys, toolbar, selected } = get();
    const next = key && conceptKeys.includes(key) ? key : null;
    // Toolbar isolation follows the selection; without a focus it switches off (W-24).
    set({ selected: next, toolbar: next ? toolbar : 'none', cited: next === selected ? get().cited : [] });
  },
  setHovered: (hovered) => {
    if (get().hovered !== hovered) set({ hovered });
  },
  setModes: (modes) => set({ modes }),
  toggleMode(id) {
    set((s) => ({ modes: toggleMode(s.modes, s.modeDefs, id) }));
  },
  applyModePatch(patch) {
    set((s) => ({ modes: applyModes(s.modes, s.modeDefs, patch) }));
  },
  isolate: () => set((s) => ({ toolbar: s.selected ? (s.toolbar === 'isolate' ? 'none' : 'isolate') : 'none' })),
  hideOthers: () => set((s) => ({ toolbar: s.selected ? (s.toolbar === 'hide' ? 'none' : 'hide') : 'none' })),
  resetView: () =>
    set((s) => ({
      toolbar: 'none',
      selected: null,
      cited: [],
      modes: applyModes(defaultModeState(s.modeDefs), s.modeDefs, s.sampleModes ?? {}),
      resetNonce: s.resetNonce + 1,
      stepCamera: null,
    })),
  setCited: (cited) => set({ cited }),
  openProcess(key, steps = [], stepIndex) {
    if (!key) return set({ process: null });
    let state = player.createPlayer(steps);
    if (typeof stepIndex === 'number') state = player.seekStep(state, stepIndex);
    set({ process: { key, state } });
  },
  playerDispatch(action) {
    const p = get().process;
    if (!p) return;
    const state = player.playerReducer(p.state, action);
    if (state !== p.state) set({ process: { key: p.key, state } });
  },
  setLessonStep: (lessonStep) => set({ lessonStep }),
  setStepFrame: ({ visibility, camera }) => set({ stepVisibility: visibility, stepCamera: camera }),
  setFindItem: (findItemKey) => set({ findItemKey, findAnswer: null }),
  showSample(sample, defs) {
    const s = get();
    const key = sample?.key ?? null;
    if (key === s.sample) return;
    const patch = sample?.scene?.modes ?? null;
    // Leaving a sample that set modes restores the defaults; otherwise the teacher's
    // toggles carry over (where the new scene still offers them).
    // Carry the teacher's own changes (differences from the old scene's defaults), so the new
    // scene's defaults (e.g. shells off for a sample) still apply.
    const before = defaultModeState(s.modeDefs);
    const changed = s.sampleModes ? {} : Object.fromEntries(Object.entries(s.modes).filter(([k, val]) => before[k] !== val));
    const base = applyModes(defaultModeState(defs), defs, changed);
    set({
      sample: key,
      sampleCamera: sample?.scene?.camera ?? null,
      sampleModes: patch,
      modeDefs: defs,
      modes: applyModes(base, defs, patch ?? {}),
      selected: null,
      toolbar: 'none',
      cited: [],
    });
  },
  pick(key) {
    const { findItemKey } = get();
    if (findItemKey) {
      if (key) set({ findAnswer: { itemKey: findItemKey, conceptKey: key }, findItemKey: null });
      return;
    }
    get().select(key);
  },
}));

/** Effective per-concept visibility: tour step > toolbar command > all normal. */
export function effectiveVisibility(s: Pick<ViewerStore, 'conceptKeys' | 'selected' | 'toolbar' | 'stepVisibility'>): Record<string, ConceptVisibility> {
  if (s.stepVisibility) return s.stepVisibility;
  if (s.selected && s.toolbar === 'isolate') return isolateSelected(s.conceptKeys, s.selected);
  if (s.selected && s.toolbar === 'hide') return hideOthers(s.conceptKeys, s.selected);
  return conceptVisibility(s.conceptKeys);
}

/**
 * Imperative scene handle, registered by the lazily-loaded 3D viewer: capture
 * the canvas for snapshots (W-51) and read the current camera.
 */
export interface SceneHandle {
  capture(): string | null;
  camera(): Camera | null;
}
let handle: SceneHandle | null = null;
export const sceneHandle = {
  set: (h: SceneHandle | null) => {
    handle = h;
  },
  get: (): SceneHandle | null => handle,
};
