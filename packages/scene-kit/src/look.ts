/**
 * Pure material "look" of a concept (TZ W-22 highlight, W-24 isolate/hide,
 * W-25 transparent membranes). Every plugin derives its material props from
 * here so ghosting, hiding and highlighting behave the same in all scenes.
 */
import type { ViewerState } from '@bilig/scene-core';

export interface LookOptions {
  /** Shell concept (membrane, wall, faces): always translucent, never occludes. */
  container?: boolean;
  /** Explicit base colour (CSS colour); defaults to the concept hue colour. */
  baseColor?: string;
  /** Concept hue 0–359 used when no baseColor is given. */
  hue?: number;
  /** Opacity for containers in normal state. */
  containerOpacity?: number;
}

export interface ConceptLook {
  visible: boolean;
  color: string;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  emissive: string;
  emissiveIntensity: number;
  /** Selected / step-highlighted / cited by the tutor. */
  highlighted: boolean;
  /** Under the pointer. */
  hovered: boolean;
  /** Another structure is in focus: this one steps back. */
  dimmed: boolean;
}

export const GHOST_OPACITY = 0.12;
export const CONTAINER_OPACITY = 0.22;
/** Opacity of solids that step back while another structure is in focus. */
export const DIM_OPACITY = 0.32;
/** Selection glow (Workbench gold) and its strengths. */
export const GLOW_COLOR = '#ffc24b';
export const GLOW_INTENSITY = 0.42;
export const HOVER_INTENSITY = 0.2;

/** Concept colour from its hue (HSL, CSS string accepted by THREE.Color) — shared with the UI dots. */
export { conceptColor } from '@bilig/scene-core';
import { conceptColor } from '@bilig/scene-core';

/** Is the concept highlighted by selection, the current process step or a tutor citation? */
export function isHighlighted(conceptKey: string | undefined, state: ViewerState): boolean {
  if (!conceptKey) return false;
  return (
    state.selectedConceptKey === conceptKey ||
    state.highlightConceptKey === conceptKey ||
    !!state.citedConceptKeys?.includes(conceptKey)
  );
}

/** Pure look computation for a concept in the current viewer state. */
export function lookFor(conceptKey: string | undefined, state: ViewerState, opts: LookOptions = {}): ConceptLook {
  const vis = (conceptKey && state.visibility?.[conceptKey]) || 'normal';
  const color = opts.baseColor ?? conceptColor(opts.hue ?? 210);
  const highlighted = isHighlighted(conceptKey, state);
  const hovered = !!conceptKey && state.hoveredConceptKey === conceptKey;
  const focusActive = !!(state.selectedConceptKey || state.highlightConceptKey);
  const dimmed = focusActive && !highlighted && !hovered;
  const base = {
    color,
    emissive: highlighted || hovered ? GLOW_COLOR : color,
    emissiveIntensity: highlighted ? GLOW_INTENSITY : hovered ? HOVER_INTENSITY : 0.04,
    highlighted,
    hovered,
    dimmed: false,
  };
  if (vis === 'hidden') {
    return { ...base, visible: false, opacity: 0, transparent: true, depthWrite: false };
  }
  if (vis === 'ghost') {
    return { ...base, visible: true, opacity: GHOST_OPACITY, transparent: true, depthWrite: false, emissiveIntensity: 0 };
  }
  if (opts.container) {
    const o = opts.containerOpacity ?? CONTAINER_OPACITY;
    const op = highlighted ? Math.min(0.45, o * 1.8) : dimmed ? o * 0.5 : o;
    return { ...base, dimmed, visible: true, opacity: op, transparent: true, depthWrite: false };
  }
  if (dimmed) return { ...base, dimmed, visible: true, opacity: DIM_OPACITY, transparent: true, depthWrite: false, emissiveIntensity: 0 };
  return { ...base, visible: true, opacity: 1, transparent: false, depthWrite: true };
}
