import { describe, it, expect } from 'vitest';
import { stepper } from './index.js';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const tour = animalCellPackage.topic.activities.tour!;
const keys = animalCellPackage.topic.conceptKeys;

describe('tour / lesson stepper (W-50)', () => {
  it('navigates within bounds with «Шаг N из M»', () => {
    let s = stepper.createStepper(tour.steps.length);
    expect(stepper.stepLabel(s)).toEqual({ current: 1, total: 3 });
    expect(stepper.isFirst(s)).toBe(true);
    s = stepper.prev(s);
    expect(s.index).toBe(0);
    s = stepper.next(stepper.next(stepper.next(s)));
    expect(s.index).toBe(2);
    expect(stepper.isLast(s)).toBe(true);
    expect(stepper.goTo(s, -5).index).toBe(0);
    expect(stepper.first(s).index).toBe(0);
    expect(stepper.last(stepper.createStepper(3)).index).toBe(2);
    expect(stepper.createStepper(3, 10).index).toBe(2);
  });

  it('empty tours are safe', () => {
    const s = stepper.createStepper(0);
    expect(stepper.next(s).index).toBe(0);
    expect(stepper.stepLabel(s)).toEqual({ current: 0, total: 0 });
    expect(stepper.isLast(s)).toBe(true);
  });

  it('keyboard and presentation remotes', () => {
    expect(stepper.keyToStepCommand('ArrowRight')).toBe('next');
    expect(stepper.keyToStepCommand('PageDown')).toBe('next');
    expect(stepper.keyToStepCommand(' ')).toBe('next');
    expect(stepper.keyToStepCommand('PageUp')).toBe('prev');
    expect(stepper.keyToStepCommand('ArrowLeft')).toBe('prev');
    expect(stepper.keyToStepCommand('Home')).toBe('first');
    expect(stepper.keyToStepCommand('End')).toBe('last');
    expect(stepper.keyToStepCommand('a')).toBeNull();
    const s = stepper.createStepper(3, 1);
    expect(stepper.applyStepCommand(s, 'next').index).toBe(2);
    expect(stepper.applyStepCommand(s, 'prev').index).toBe(0);
    expect(stepper.applyStepCommand(s, 'last').index).toBe(2);
    expect(stepper.applyStepCommand(s, 'first').index).toBe(0);
    expect(stepper.applyStepCommand(s, null)).toBe(s);
  });

  it('lessonFrame exposes step text, focus and visibility', () => {
    const f = stepper.lessonFrame(tour, stepper.createStepper(3, 1), keys)!;
    expect(f.step.key).toBe('nucleus');
    expect(f.focus).toBe('bio.nucleus');
    expect(f.label).toEqual({ current: 2, total: 3 });
    expect(f.visibility['bio.membrane']).toBe('ghost');
    expect(stepper.lessonFrame(tour, stepper.createStepper(3, 0), keys)!.focus).toBeNull();
    expect(stepper.lessonFrame({ steps: [] } as never, stepper.createStepper(0), keys)).toBeNull();
  });
});
