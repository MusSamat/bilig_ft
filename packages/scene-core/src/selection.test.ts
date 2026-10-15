import { describe, it, expect } from 'vitest';
import {
  anchorFor,
  conceptVisibility,
  hideOthers,
  hueFor,
  isolateSelected,
  pickConcept,
  selectByKey,
  type Hit,
} from './index.js';
import { topicConcepts } from '@bilig/content-model';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const concepts = topicConcepts(animalCellPackage);
const keys = animalCellPackage.topic.conceptKeys;
const nucleus = concepts.find((c) => c.key === 'bio.nucleus')!;

describe('pickConcept (W-21: shells do not steal clicks)', () => {
  it('prefers a non-container even if the shell is nearer', () => {
    const hits: Hit[] = [
      { conceptKey: 'bio.membrane', distance: 1 },
      { conceptKey: 'bio.nucleus', distance: 5 },
    ];
    expect(pickConcept(hits, concepts)).toBe('bio.nucleus');
  });

  it('nearest solid among several; nearest shell if only shells', () => {
    expect(pickConcept([{ conceptKey: 'bio.mitochondrion', distance: 3 }, { conceptKey: 'bio.nucleus', distance: 2 }], concepts)).toBe('bio.nucleus');
    expect(pickConcept([{ conceptKey: 'bio.membrane', distance: 1 }], concepts)).toBe('bio.membrane');
  });

  it('ignores unknown keys; null when nothing is hit', () => {
    expect(pickConcept([{ conceptKey: 'ghost', distance: 0 }, { conceptKey: 'bio.membrane', distance: 2 }], concepts)).toBe('bio.membrane');
    expect(pickConcept([{ conceptKey: 'ghost', distance: 0 }], concepts)).toBeNull();
    expect(pickConcept([], concepts)).toBeNull();
  });
});

describe('selectByKey / anchorFor / hueFor', () => {
  it('selects only existing keys', () => {
    expect(selectByKey(concepts, 'bio.nucleus')).toBe('bio.nucleus');
    expect(selectByKey(concepts, 'bio.ghost')).toBeNull();
    expect(selectByKey(concepts, null)).toBeNull();
  });

  it('override anchor > fallback (first instance) > undefined', () => {
    const o = animalCellPackage.topic.overrides;
    expect(anchorFor('bio.nucleus', o, [9, 9, 9])).toEqual([0, 0.2, 0]);
    expect(anchorFor('bio.membrane', o, [9, 9, 9])).toEqual([9, 9, 9]);
    expect(anchorFor('bio.membrane', o)).toBeUndefined();
    expect(anchorFor('bio.nucleus', undefined)).toBeUndefined();
  });

  it('override hue > concept hue', () => {
    expect(hueFor(nucleus)).toBe(280);
    expect(hueFor(nucleus, { hue: 10 })).toBe(10);
    expect(hueFor(nucleus, {})).toBe(280);
  });
});

describe('visibility (W-24 «Выделить» / «Скрыть остальное», tour steps)', () => {
  it('isolate ghosts the others; hide hides; hide wins', () => {
    expect(conceptVisibility(keys)).toEqual({ 'bio.membrane': 'normal', 'bio.nucleus': 'normal', 'bio.mitochondrion': 'normal' });
    expect(conceptVisibility(keys, { isolate: ['bio.nucleus'], hide: ['bio.membrane', 'bio.nucleus'] })).toEqual({
      'bio.membrane': 'hidden', 'bio.nucleus': 'hidden', 'bio.mitochondrion': 'ghost',
    });
    expect(isolateSelected(keys, 'bio.nucleus')['bio.membrane']).toBe('ghost');
    expect(hideOthers(keys, 'bio.nucleus')).toEqual({ 'bio.membrane': 'hidden', 'bio.nucleus': 'normal', 'bio.mitochondrion': 'hidden' });
  });
});
