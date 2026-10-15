/** React/r3f hooks shared by scene plugins. */
import { useCallback, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { PickableConcept, ViewerState } from '@bilig/scene-core';
import { lookFor, type ConceptLook, type LookOptions } from './look.js';
import { resolvePick, type IntersectionLike } from './pick.js';

/** Memoised material props for a concept. */
export function useConceptLook(conceptKey: string | undefined, state: ViewerState, opts: LookOptions = {}): ConceptLook {
  const { container, baseColor, hue, containerOpacity } = opts;
  return useMemo(
    () => lookFor(conceptKey, state, { container, baseColor, hue, containerOpacity }),
    [conceptKey, state, container, baseColor, hue, containerOpacity],
  );
}

/** onClick handler resolving the clicked concept through pickConcept (W-21). */
export function usePick(
  concepts: readonly PickableConcept[],
  onSelect: (key: string | null) => void,
): (e: ThreeEvent<MouseEvent>) => void {
  return useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const key = resolvePick(e.intersections as unknown as IntersectionLike[], concepts);
      if (key) onSelect(key);
    },
    [concepts, onSelect],
  );
}

const setCursor = (c: string) => {
  if (typeof document !== 'undefined') document.body.style.cursor = c;
};

/** Pointer cursor on hover over pickable meshes. */
export const hoverHandlers = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setCursor('pointer');
  },
  onPointerOut: () => setCursor('auto'),
};

/**
 * Animation clock in seconds. Advances only while `enabled` (pass
 * `!state.reducedMotion`); frozen time stays at its last value (or 0).
 */
export function useClock(enabled: boolean): React.MutableRefObject<number> {
  const t = useRef(0);
  useFrame((_, dt) => {
    if (enabled) t.current += Math.min(dt, 0.1);
  });
  return t;
}
