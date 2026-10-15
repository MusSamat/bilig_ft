import { describe, expect, it } from 'vitest';
import { SlideSchema } from '@bilig/content-model/api';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';
import { templateSlides } from './template';

describe('deterministic deck template (W-52)', () => {
  it('builds title + one slide per structure + a process slide, valid against the contract', () => {
    const slides = templateSlides(animalCellPackage, 'ru');
    expect(slides.map((s) => s.kind)).toEqual(['title', 'concept', 'concept', 'concept', 'process']);
    slides.forEach((s) => expect(SlideSchema.safeParse(s).success).toBe(true));
    expect(slides[0]).toMatchObject({ title: 'Животная клетка' });
    const proc = slides[4];
    expect(proc.kind === 'process' && proc.equation).toBe('C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O');
  });
  it('is deterministic and attaches the latest snapshot of a structure', () => {
    const snaps = [
      { id: '11111111-1111-4111-8111-111111111111', focus: 'bio.nucleus', createdAt: '2026-01-01T00:00:00Z' },
      { id: '22222222-2222-4222-8222-222222222222', focus: 'bio.nucleus', createdAt: '2026-02-01T00:00:00Z' },
    ];
    const a = templateSlides(animalCellPackage, 'en', snaps);
    expect(a).toEqual(templateSlides(animalCellPackage, 'en', snaps));
    const nucleus = a.find((s) => s.kind === 'concept' && s.conceptKey === 'bio.nucleus');
    expect(nucleus && 'snapshotId' in nucleus && nucleus.snapshotId).toBe(snaps[1].id);
  });
});
