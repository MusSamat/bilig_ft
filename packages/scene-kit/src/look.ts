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
  /** Draw after every see-through part (FOCUS_RENDER_ORDER) so nothing veils it. */
  onTop: boolean;
  /** Colour saturation, 1 = as authored; dimmed structures fade towards grey. */
  saturation: number;
}

export const GHOST_OPACITY = 0.12;
export const CONTAINER_OPACITY = 0.22;
/** Opacity of solids that step back while another structure is in focus. */
export const DIM_OPACITY = 0.3;
/** Saturation of structures that step back: the one in focus keeps its true colours. */
export const DIM_SATURATION = 0.18;
/** Selection outline (Workbench gold); see outline.ts. */
export const GLOW_COLOR = '#ffc24b';
/**
 * Self-illumination in the structure's OWN colour: the selection lifts the
 * structure without washing its colours out (the outline marks it).
 */
export const GLOW_INTENSITY = 0.16;
export const HOVER_INTENSITY = 0.08;
/** How far a model with its own colours (GLB) turns to the concept colour in focus / under the pointer. */
export const FOCUS_TINT = 0.82;
export const HOVER_TINT = 0.3;
/** Render order of the structure in focus: after every see-through part, so nothing veils it. */
export const FOCUS_RENDER_ORDER = 10;

/** Concept colour from its hue (HSL, CSS string accepted by THREE.Color) — shared with the UI dots. */
export { conceptColor } from '@bilig/scene-core';
import { conceptColor } from '@bilig/scene-core';
import { Color } from 'three';

/** A CSS colour moved towards its own luminance grey (`s` = 1 keeps it), as `#rrggbb`. */
export function desaturate(css: string, s: number): string {
  if (s >= 1) return css;
  const c = new Color(css);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return `#${c.lerp(new Color(l, l, l), 1 - Math.max(0, s)).getHexString()}`;
}

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
  // In focus every structure shows its concept colour — the colour of its chip,
  // label dot and card — even when it is normally drawn in a fixed colour (CPK
  // atoms, wires), so the class links the word and the part at a glance.
  const own = highlighted && opts.hue !== undefined ? conceptColor(opts.hue) : color;
  const base = {
    color: own,
    emissive: own,
    emissiveIntensity: highlighted ? GLOW_INTENSITY : hovered ? HOVER_INTENSITY : 0.04,
    highlighted,
    hovered,
    dimmed: false,
    saturation: 1,
    onTop: false,
  };
  if (vis === 'hidden') {
    return { ...base, visible: false, opacity: 0, transparent: true, depthWrite: false };
  }
  if (vis === 'ghost') {
    return { ...base, visible: true, opacity: GHOST_OPACITY, transparent: true, depthWrite: false, emissiveIntensity: 0 };
  }
  if (opts.container) {
    const o = opts.containerOpacity ?? CONTAINER_OPACITY;
    const op = highlighted ? Math.max(o, Math.min(0.6, o * 1.8)) : dimmed ? o * 0.5 : o;
    const sat = dimmed ? DIM_SATURATION : 1;
    return { ...base, color: desaturate(color, sat), emissive: desaturate(color, sat), saturation: sat, dimmed, visible: true, opacity: op, transparent: true, depthWrite: false };
  }
  if (dimmed) {
    const grey = desaturate(color, DIM_SATURATION);
    return { ...base, color: grey, emissive: grey, saturation: DIM_SATURATION, dimmed, visible: true, opacity: DIM_OPACITY, transparent: true, depthWrite: false, emissiveIntensity: 0 };
  }
  // In the transparent queue with full opacity: sorted after the dimmed, see-through rest.
  if (highlighted) return { ...base, visible: true, opacity: 1, transparent: true, depthWrite: true, onTop: true };
  return { ...base, visible: true, opacity: 1, transparent: false, depthWrite: true };
}
