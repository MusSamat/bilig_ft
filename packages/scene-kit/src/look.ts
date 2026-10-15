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
}

export const GHOST_OPACITY = 0.12;
export const CONTAINER_OPACITY = 0.22;

/** Concept colour from its hue (HSL, CSS string accepted by THREE.Color). */
export function conceptColor(hue: number, lightness = 60, saturation = 65): string {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  return `hsl(${h}, ${saturation}%, ${lightness}%)`;
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
  const base = {
    color,
    emissive: color,
    emissiveIntensity: highlighted ? 0.55 : 0.04,
    highlighted,
  };
  if (vis === 'hidden') {
    return { ...base, visible: false, opacity: 0, transparent: true, depthWrite: false };
  }
  if (vis === 'ghost') {
    return { ...base, visible: true, opacity: GHOST_OPACITY, transparent: true, depthWrite: false, emissiveIntensity: 0 };
  }
  if (opts.container) {
    const o = opts.containerOpacity ?? CONTAINER_OPACITY;
    return { ...base, visible: true, opacity: highlighted ? Math.min(0.45, o * 1.8) : o, transparent: true, depthWrite: false };
  }
  return { ...base, visible: true, opacity: 1, transparent: false, depthWrite: true };
}
