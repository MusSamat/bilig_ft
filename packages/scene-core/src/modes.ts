/**
 * «Вид модели» panel logic (TZ W-23): the panel is built from the plugin's
 * modes() intersected with the topic's `scene.modes`, plus universal modes.
 * Grouped modes are mutually exclusive segments; ungrouped ones are toggles.
 */
import type { Localized } from '@bilig/content-model';

export interface ModeDef {
  id: string;
  label: Localized;
  /** Mutually-exclusive segment group (e.g. `view`: whole/section); absent = toggle. */
  group?: string;
  /** Pre-selected when the scene loads (first of a group if none is flagged). */
  default?: boolean;
}

/** Mode state: `state[group] = selectedModeId`, `state[toggleId] = boolean`. */
export type ModeState = Record<string, boolean | string>;

/** Always-present modes every scene has («Подписи», «Вращение»). */
export const UNIVERSAL_MODES: readonly ModeDef[] = [
  { id: 'labels', label: { ky: 'Белгилер', ru: 'Подписи', en: 'Labels' } },
  { id: 'rotate', label: { ky: 'Айлануу', ru: 'Вращение', en: 'Rotation' }, default: true },
];

/**
 * Panel modes for a scene: plugin modes allowed by `sceneModes` (all plugin
 * modes when `sceneModes` is empty), in plugin order, then the universal modes.
 * Duplicate ids keep the first definition.
 */
export function resolveModes(
  pluginModes: readonly ModeDef[],
  sceneModes: readonly string[],
  universal: readonly ModeDef[] = UNIVERSAL_MODES,
): ModeDef[] {
  const allowed = sceneModes.length ? new Set(sceneModes) : null;
  const out: ModeDef[] = [];
  const seen = new Set<string>();
  for (const m of [...pluginModes.filter((m) => !allowed || allowed.has(m.id)), ...universal]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Group ids in panel order. */
export function modeGroups(defs: readonly ModeDef[]): string[] {
  return [...new Set(defs.filter((d) => d.group).map((d) => d.group!))];
}

/** Default state: each group selects its default (or first) mode; toggles take `default`. */
export function defaultModeState(defs: readonly ModeDef[]): ModeState {
  const state: ModeState = {};
  for (const g of modeGroups(defs)) {
    const members = defs.filter((d) => d.group === g);
    state[g] = (members.find((d) => d.default) ?? members[0]).id;
  }
  for (const d of defs) if (!d.group) state[d.id] = !!d.default;
  return state;
}

export function isModeActive(state: ModeState, def: ModeDef): boolean {
  return def.group ? state[def.group] === def.id : state[def.id] === true;
}

/** Click on a mode: select within its group (exclusive) or flip a toggle. Unknown ids are ignored. */
export function toggleMode(state: ModeState, defs: readonly ModeDef[], id: string): ModeState {
  const def = defs.find((d) => d.id === id);
  if (!def) return state;
  if (def.group) return { ...state, [def.group]: def.id };
  return { ...state, [def.id]: !state[def.id] };
}

/** Apply a partial mode map (e.g. a tour step's `modes`), ignoring unknown keys/values. */
export function applyModes(
  state: ModeState,
  defs: readonly ModeDef[],
  patch: Record<string, boolean | string>,
): ModeState {
  let next = state;
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'string') {
      const def = defs.find((d) => d.id === v && d.group === k);
      if (def) next = { ...next, [k]: v };
    } else if (defs.some((d) => d.id === k && !d.group)) {
      next = { ...next, [k]: v };
    }
  }
  return next;
}

/**
 * Compact URL tokens of the state's differences from the defaults (W-05):
 * a selected non-default group mode → `id`; a toggle on → `id`; a default-on toggle off → `-id`.
 */
export function encodeModes(state: ModeState, defs: readonly ModeDef[]): string[] {
  const def = defaultModeState(defs);
  const out: string[] = [];
  for (const g of modeGroups(defs)) {
    if (state[g] !== undefined && state[g] !== def[g]) out.push(String(state[g]));
  }
  for (const d of defs.filter((x) => !x.group)) {
    const on = state[d.id] === true;
    if (on !== def[d.id]) out.push(on ? d.id : `-${d.id}`);
  }
  return out;
}

/** Inverse of `encodeModes`; unknown tokens are ignored. */
export function decodeModes(tokens: readonly string[], defs: readonly ModeDef[]): ModeState {
  let state = defaultModeState(defs);
  for (const tok of tokens) {
    const off = tok.startsWith('-');
    const id = off ? tok.slice(1) : tok;
    const d = defs.find((x) => x.id === id);
    if (!d) continue;
    if (d.group) {
      if (!off) state = { ...state, [d.group]: d.id };
    } else {
      state = { ...state, [d.id]: !off };
    }
  }
  return state;
}
