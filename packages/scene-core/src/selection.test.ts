import { describe, it, expect } from 'vitest';
import { pickConcept, anchorFor, hueFor, type Hit } from './selection.js';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const concepts = animalCellPackage.topics[0].concepts;
const membrane = concepts.find((c) => c.id === 'bio.membrane')!;
const nucleus = concepts.find((c) => c.id === 'bio.nucleus')!;

describe('pickConcept (TZ W-21: shells do not steal clicks)', () => {
  it('prefers a non-container structure over an enclosing shell, even if the shell is nearer', () => {
    const hits: Hit[] = [
      { conceptId: 'bio.membrane', distance: 1 }, // container, closest
      { conceptId: 'bio.nucleus', distance: 5 }, // inner structure, farther
    ];
    expect(pickConcept(hits, concepts)).toBe('bio.nucleus');
  });

  it('among several solids, picks the nearest', () => {
    const hits: Hit[] = [
      { conceptId: 'bio.mitochondrion', distance: 3 },
      { conceptId: 'bio.nucleus', distance: 2 },
    ];
    expect(pickConcept(hits, concepts)).toBe('bio.nucleus');
  });

  it('falls back to the nearest shell when only shells are hit', () => {
    const hits: Hit[] = [{ conceptId: 'bio.membrane', distance: 1 }];
    expect(pickConcept(hits, concepts)).toBe('bio.membrane');
  });

  it('returns null when nothing is hit', () => {
    expect(pickConcept([], concepts)).toBeNull();
  });
});

describe('anchorFor / hueFor (TZ W-22, W-31 overrides win)', () => {
  it('uses the scene override anchor before the concept anchor', () => {
    expect(anchorFor(nucleus)).toEqual([0, 0, 0]);
    expect(anchorFor(nucleus, { anchor: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('override hue > concept hue > fallback', () => {
    expect(hueFor(nucleus, 140)).toBe(280); // concept.colorHue
    expect(hueFor(nucleus, 140, { colorHue: 10 })).toBe(10); // override wins
    expect(hueFor(membrane, 140)).toBe(140); // fallback (no own hue)
  });
});
