import { describe, it, expect } from 'vitest';
import type { ResolvedConcept } from '@bilig/content-model';
import { bindParts, namesForMask, unboundConcepts, type Part } from './parts.js';

const concept = (key: string, nodes?: string[], isContainer = false): ResolvedConcept => ({
  key, kind: 'k', hue: 10, isContainer, title: { ky: key, ru: key, en: key }, description: { ky: 'd', ru: 'd', en: 'd' },
  props: [], related: [], misconceptions: [], examples: { stem: [], simple: [] }, nodes,
});

describe('bindParts', () => {
  const parts: Part[] = [
    { name: 'Mol_A', shape: { kind: 'group' } },
    { name: 'Atom_O1', parent: 'Mol_A', shape: { kind: 'sphere', radius: 1 } },
    { name: 'Atom_H1', parent: 'Mol_A', shape: { kind: 'sphere', radius: 1 } },
    { name: 'Bond_O1_H1', parent: 'Mol_A', shape: { kind: 'tube', from: [0, 0, 0], to: [1, 0, 0], radius: 0.1 } },
    { name: 'Loose', shape: { kind: 'box', size: [1, 1, 1] }, concept: 'x.explicit' },
  ];
  const concepts = [concept('x.mol', ['Mol_*'], true), concept('x.h', ['Atom_H*']), concept('x.bond', ['Bond_*']), concept('x.explicit')];
  it('own name, then parent group, then explicit concept', () => {
    const b = bindParts(parts, concepts);
    expect(b.get('Atom_H1')).toBe('x.h');
    expect(b.get('Atom_O1')).toBe('x.mol');
    expect(b.get('Bond_O1_H1')).toBe('x.bond');
    expect(b.get('Loose')).toBe('x.explicit');
  });
  it('reports concepts with masks that nothing binds', () => {
    expect(unboundConcepts(parts, [...concepts, concept('x.none', ['Nope'])])).toEqual(['x.none']);
  });
  it('expands masks', () => {
    expect(namesForMask('Mito_*', 2)).toEqual(['Mito_1', 'Mito_2']);
    expect(namesForMask('Nucleus', 3)).toEqual(['Nucleus']);
  });
});
