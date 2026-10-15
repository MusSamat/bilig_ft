/**
 * Tour / lesson stepper (TZ W-50): «Шаг N из M», «Назад / Далее», keyboard
 * arrows and presentation remotes (which send PageUp/PageDown).
 */
import type { Tour, TourStep } from '@bilig/content-model';
import { conceptVisibility, type ConceptVisibility } from './selection.js';

export interface StepperState {
  index: number;
  count: number;
}

const clampIndex = (i: number, count: number) =>
  count === 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(i)));

export const createStepper = (count: number, index = 0): StepperState => ({
  count: Math.max(0, Math.floor(count)),
  index: clampIndex(index, Math.max(0, Math.floor(count))),
});

export const next = (s: StepperState): StepperState => ({ ...s, index: clampIndex(s.index + 1, s.count) });
export const prev = (s: StepperState): StepperState => ({ ...s, index: clampIndex(s.index - 1, s.count) });
export const goTo = (s: StepperState, index: number): StepperState => ({ ...s, index: clampIndex(index, s.count) });
export const first = (s: StepperState): StepperState => goTo(s, 0);
export const last = (s: StepperState): StepperState => goTo(s, s.count - 1);
export const isFirst = (s: StepperState): boolean => s.index === 0;
export const isLast = (s: StepperState): boolean => s.count === 0 || s.index === s.count - 1;

/** «Шаг N из M» numbers (1-based). */
export const stepLabel = (s: StepperState): { current: number; total: number } => ({
  current: s.count === 0 ? 0 : s.index + 1,
  total: s.count,
});

export type StepCommand = 'next' | 'prev' | 'first' | 'last';

/** Map a KeyboardEvent.key to a stepper command (arrows, space, remotes' PageUp/PageDown). */
export function keyToStepCommand(key: string): StepCommand | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
      return 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

export function applyStepCommand(s: StepperState, cmd: StepCommand | null): StepperState {
  switch (cmd) {
    case 'next':
      return next(s);
    case 'prev':
      return prev(s);
    case 'first':
      return first(s);
    case 'last':
      return last(s);
    default:
      return s;
  }
}

/** What the viewer should show for the current tour step. */
export interface LessonFrame {
  step: TourStep;
  label: { current: number; total: number };
  focus: string | null;
  visibility: Record<string, ConceptVisibility>;
}

export function lessonFrame(tour: Tour, s: StepperState, conceptKeys: readonly string[]): LessonFrame | null {
  const step = tour.steps[s.index];
  if (!step) return null;
  return {
    step,
    label: stepLabel(s),
    focus: step.focus ?? null,
    visibility: conceptVisibility(conceptKeys, step.visibility),
  };
}
