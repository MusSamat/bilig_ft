/**
 * @bilig/scene-core — the viewer core contract shared by every scene plugin
 * (TZ W-20..W-26, W-41, W-50). The engine is identical for all subjects; a
 * subject only ships data + a plugin kind. There is NO `if (subject)` in UI
 * code (W-23) — the panel, modes, readouts and tools derive from the plugin
 * and the topic's SceneSpec. Everything except the React component type is pure.
 */
import type { ComponentType } from 'react';
import type {
  Lang,
  Localized,
  Process,
  ResolvedConcept,
  SceneSpec,
  ScenePluginKind,
  Topic,
} from '@bilig/content-model';
import { resolveModes, type ModeDef, type ModeState } from './modes.js';
import type { ConceptVisibility } from './selection.js';
import type { PlayerView } from './player.js';
import { engineReadouts } from './engines.js';

/** A process readout (W-43). Values come from the plugin, never hand-drawn. */
export interface Readout {
  key: string;
  label: Localized;
  value: number | string;
  unit?: string;
  min?: number;
  max?: number;
}

/** Live viewer state the engine owns and passes to plugins. */
export interface ViewerState {
  lang: Lang;
  /** Selected concept key, or null in overview (W-30/W-31). */
  selectedConceptKey: string | null;
  /** Structure under the pointer: a light highlight and its name label. */
  hoveredConceptKey?: string | null;
  modes: ModeState;
  /** Per-concept visibility (toolbar / tour step). Absent key = normal. */
  visibility?: Record<string, ConceptVisibility>;
  /** Active process playback (W-41). */
  process?: PlayerView & { key: string };
  /** Current process step's structure, highlighted in 3D (W-42). */
  highlightConceptKey?: string | null;
  /** Concepts cited by the assistant, highlighted in 3D (W-32). */
  citedConceptKeys?: string[];
  /** `prefers-reduced-motion`: plugins must not animate decoratively (§10). */
  reducedMotion?: boolean;
}

/** What a plugin's Component receives inside the shared canvas. */
export interface SceneProps {
  topic: Topic;
  /** Topic concepts merged with overrides, in display order. */
  concepts: ResolvedConcept[];
  state: ViewerState;
  /** Select by key (null = deselect). Containers never steal clicks (W-21) — use pickConcept. */
  onSelectConcept: (key: string | null) => void;
  /** Base URL for package-relative asset paths (`SceneSpec.asset`), from the manifest. */
  assetBaseUrl?: string;
}

/**
 * Engine conventions every plugin follows so the shared viewer core can fly
 * the camera, place labels and capture snapshots without knowing the plugin:
 *  - every pickable mesh sets `userData.conceptKey` (see CONCEPT_KEY_USERDATA);
 *  - plugins never draw labels — the core places them from anchors (W-22);
 *  - per-concept visibility (`state.visibility`) is honoured: ghost = translucent, hidden = not rendered;
 *  - containers (`isContainer`) are drawn translucent and resolved through `pickConcept`.
 */
export const CONCEPT_KEY_USERDATA = 'conceptKey';

/** A scene plugin; `type` matches `SceneSpec.plugin`. */
export interface ScenePlugin {
  type: ScenePluginKind;
  /** Modes the plugin offers for a scene (W-23). */
  modes(scene: SceneSpec): ModeDef[];
  Component: ComponentType<SceneProps>;
  /** Process readouts for the current playback (W-43). Falls back to the engine readouts. */
  readouts?(process: Process, playback: PlayerView): Readout[];
}

/** The plugin registry; apps register concrete plugins at startup. */
export class PluginRegistry {
  private readonly plugins = new Map<string, ScenePlugin>();

  register(plugin: ScenePlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: string): ScenePlugin | undefined {
    return this.plugins.get(type);
  }

  has(type: string): boolean {
    return this.plugins.has(type);
  }

  /** Panel modes: plugin modes ∩ scene.modes, then the universal modes. */
  modesFor(scene: SceneSpec): ModeDef[] {
    const plugin = this.get(scene.plugin);
    return resolveModes(plugin ? plugin.modes(scene) : [], scene.modes);
  }

  /** W-43 readouts: the scene plugin's own readouts when it has any, else the process engine's. */
  readoutsFor(scene: SceneSpec, process: Process, playback: PlayerView): Readout[] {
    const own = this.get(scene.plugin)?.readouts?.(process, playback);
    return own && own.length ? own : engineReadouts(process, playback);
  }
}

/** Singleton registry for the running app. */
export const registry = new PluginRegistry();

export * from './tokens.js'; // W-03: tokens from hue, AA contrast
export * from './modes.js'; // W-23: panel modes, group exclusivity, defaults, URL tokens
export * from './selection.js'; // W-21/W-22/W-24/W-31: picking, anchors, hues, visibility
export * from './navigation.js'; // W-04: breadcrumbs, course tree, catalog groups
export * from './state.js'; // W-05/W-51: URL state & snapshots
export * from './progress.js'; // W-11: изучено N из M, offline merge
export * from './engines.js'; // W-41/W-43: timeline, stoich, ode readouts
export * from './labels.js'; // W-22: label placement without overlaps
/** W-41 process player (pure reducer): `player.play(s)`, `player.tick(s, dt)`… */
export * as player from './player.js';
export type { PlayerState, PlayerAction, PlayerView, Segment, Speed } from './player.js';
export { SPEEDS } from './player.js';
/** W-50 tour / lesson stepper: `stepper.next(s)`, `stepper.keyToStepCommand(key)`… */
export * as stepper from './stepper.js';
export type { StepperState, StepCommand, LessonFrame } from './stepper.js';
