/**
 * @bilig/scene-core — the viewer core contract shared by every scene plugin
 * (TZ W-20..W-26). The engine (bilig_ft) is identical for all subjects; a
 * subject only ships data + a plugin type. There is NO `if (subject)` anywhere
 * in UI code (TZ W-23) — the panel, modes, readouts and tools are all derived
 * from the plugin + the topic's SceneSpec.
 */
import type { ComponentType } from 'react';
import type {
  Concept,
  Lang,
  Localized,
  PluginType,
  Process,
  SceneSpec,
  Topic,
} from '@bilig/content-model';

/** A toggle/segment in the "Вид модели" panel (TZ W-23). Built from data. */
export interface ModeDef {
  id: string;
  label: Localized;
  /** Mutually-exclusive segment group (e.g. "representation"); absent = standalone toggle. */
  group?: string;
  /** Pre-selected when the scene loads. */
  default?: boolean;
}

/** A numeric/labelled process readout (TZ W-43). Values come from the plugin, never drawn by hand. */
export interface Readout {
  id: string;
  label: Localized;
  value: number | string;
  unit?: string;
  min?: number;
  max?: number;
}

/** Live viewer state the engine owns and passes to plugins. */
export interface ViewerState {
  lang: Lang;
  /** Currently selected concept id, or null in overview (TZ W-30/W-31). */
  selectedConceptId: string | null;
  /** Active mode ids keyed by group (and standalone toggles). */
  modes: Record<string, boolean | string>;
  /** Process playback, when a process is active (TZ W-41). */
  process?: {
    id: string;
    stepIndex: number;
    playing: boolean;
    speed: number; // 0.5 | 1 | 2
    progress: number; // 0..1
  };
}

/** What a plugin's Component receives. The engine renders it inside the shared canvas. */
export interface SceneProps {
  topic: Topic;
  scene: SceneSpec;
  concepts: Concept[];
  state: ViewerState;
  /** Select a concept by id (null to deselect). Shells (container=true) ignore clicks — TZ W-21. */
  onSelectConcept: (id: string | null) => void;
}

/**
 * A scene plugin. `type` matches SceneSpec.plugin; the engine dispatches on it.
 * Everything a subject needs to render + drive its 3D lives behind this contract.
 */
export interface ScenePlugin {
  type: PluginType;
  /** Modes this plugin offers for a given scene (TZ W-23: panel built from this). */
  modesFor(scene: SceneSpec): ModeDef[];
  /** The r3f/React component drawn inside the shared canvas (TZ W-20 core is shared). */
  Component: ComponentType<SceneProps>;
  /** Process readouts for the current state (TZ W-43). Optional: only `sim`/process scenes. */
  readouts?(topic: Topic, process: Process, state: ViewerState): Readout[];
}

/** Always-present modes every scene has (TZ W-23: «Подписи», «Вращение»). */
export const UNIVERSAL_MODES: ModeDef[] = [
  { id: 'labels', label: { ky: 'Белгилер', ru: 'Подписи', en: 'Labels' } },
  { id: 'rotate', label: { ky: 'Айлануу', ru: 'Вращение', en: 'Rotation' }, default: true },
];

/** The plugin registry. bilig_ft registers concrete plugins at startup. */
export class PluginRegistry {
  private readonly plugins = new Map<PluginType, ScenePlugin>();

  register(plugin: ScenePlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: PluginType): ScenePlugin | undefined {
    return this.plugins.get(type);
  }

  has(type: PluginType): boolean {
    return this.plugins.has(type);
  }

  /** Resolve the full mode list for a scene: universal modes + plugin modes. */
  modesFor(scene: SceneSpec): ModeDef[] {
    const plugin = this.get(scene.plugin);
    const pluginModes = plugin ? plugin.modesFor(scene) : [];
    // Universal modes last so representation segments come first in the panel.
    return [...pluginModes, ...UNIVERSAL_MODES];
  }
}

/** A singleton registry for the running app. */
export const registry = new PluginRegistry();

// Pure, framework-agnostic viewer logic (testable without WebGL/React).
export * from './tokens.js'; // W-03: tokens from hue, AA contrast
export * from './selection.js'; // W-21/W-22/W-31: picking, anchors, hues
export * from './navigation.js'; // W-04: course tree & breadcrumbs
export * from './state.js'; // W-05/W-51: URL state & snapshots
export * from './progress.js'; // W-11: изучено N из M, offline merge
