import { describe, it, expect } from 'vitest';
import type { ViewerState } from '@bilig/scene-core';
import { conceptColor, lookFor, GHOST_OPACITY } from './look.js';
import { conceptKeyOf, hitsFrom, resolvePick, conceptUserData } from './pick.js';

const st = (over: Partial<ViewerState> = {}): ViewerState => ({ lang: 'ky', selectedConceptKey: null, modes: {}, ...over });

describe('lookFor', () => {
  it('normal solids are opaque, containers translucent', () => {
    expect(lookFor('a', st()).opacity).toBe(1);
    const c = lookFor('a', st(), { container: true });
    expect(c.transparent).toBe(true);
    expect(c.depthWrite).toBe(false);
    expect(c.opacity).toBeLessThan(0.5);
  });
  it('ghost and hidden follow visibility', () => {
    expect(lookFor('a', st({ visibility: { a: 'ghost' } })).opacity).toBe(GHOST_OPACITY);
    expect(lookFor('a', st({ visibility: { a: 'hidden' } })).visible).toBe(false);
  });
  it('highlights selection, step highlight and citations', () => {
    expect(lookFor('a', st({ selectedConceptKey: 'a' })).highlighted).toBe(true);
    expect(lookFor('a', st({ highlightConceptKey: 'a' })).highlighted).toBe(true);
    expect(lookFor('a', st({ citedConceptKeys: ['a'] })).highlighted).toBe(true);
    expect(lookFor('b', st({ selectedConceptKey: 'a' })).highlighted).toBe(false);
    expect(lookFor(undefined, st()).highlighted).toBe(false);
  });
  it('dims the rest while a structure is in focus; hover glows lightly', () => {
    const sel = st({ selectedConceptKey: 'a', hoveredConceptKey: 'c' });
    expect(lookFor('b', sel).dimmed).toBe(true);
    expect(lookFor('b', sel).opacity).toBeLessThan(1);
    expect(lookFor('a', sel).dimmed).toBe(false);
    expect(lookFor('a', sel).emissiveIntensity).toBeGreaterThan(lookFor('c', sel).emissiveIntensity);
    expect(lookFor('c', sel).hovered).toBe(true);
    expect(lookFor('b', st()).dimmed).toBe(false);
  });
  it('conceptColor wraps hue', () => {
    expect(conceptColor(370)).toBe(conceptColor(10));
  });
});

describe('picking', () => {
  const shell = { userData: conceptUserData('shell'), parent: null };
  const inner = { userData: {}, parent: { userData: conceptUserData('core'), parent: null } };
  const concepts = [
    { key: 'shell', isContainer: true },
    { key: 'core', isContainer: false },
  ];
  it('walks up parents for the concept key', () => {
    expect(conceptKeyOf(inner)).toBe('core');
    expect(conceptKeyOf({ userData: {}, parent: null })).toBeNull();
  });
  it('shells never steal clicks from inner structures', () => {
    const hits = [
      { distance: 1, object: shell },
      { distance: 3, object: inner },
    ];
    expect(hitsFrom(hits)).toHaveLength(2);
    expect(resolvePick(hits, concepts)).toBe('core');
    expect(resolvePick([{ distance: 1, object: shell }], concepts)).toBe('shell');
  });
});
