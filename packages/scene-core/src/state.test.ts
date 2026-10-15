import { describe, it, expect } from 'vitest';
import { buildStateUrl, makeSnapshot, parseStateUrl, snapshotUrl, type SceneState } from './index.js';
import { SnapshotSchema } from '@bilig/content-model';

describe('buildStateUrl (W-05 /ky/bio/g7/animal-cell?focus=bio.nucleus)', () => {
  it('matches the TZ reference URL exactly', () => {
    expect(
      buildStateUrl({ lang: 'ky', subjectKey: 'bio', grade: 'g7', topicKey: 'animal-cell', focus: 'bio.nucleus' }),
    ).toBe('/ky/bio/g7/animal-cell?focus=bio.nucleus');
  });

  it('omits grade and defaults', () => {
    expect(buildStateUrl({ lang: 'ru', subjectKey: 'bio', topicKey: 'animal-cell', view: 'study', modes: [] })).toBe(
      '/ru/bio/animal-cell',
    );
  });

  it('encodes modes, process step and lesson view readably', () => {
    expect(
      buildStateUrl({
        lang: 'en', subjectKey: 'bio', topicKey: 'animal-cell',
        modes: ['section', '-rotate'], process: 'bio.respiration', step: 2, view: 'lesson', lessonStep: 1,
      }),
    ).toBe('/en/bio/animal-cell?mode=section,-rotate&process=bio.respiration&step=2&view=lesson&lesson=1');
  });
});

describe('parseStateUrl', () => {
  const full: SceneState = {
    lang: 'ky', subjectKey: 'bio', grade: 'g7', topicKey: 'animal-cell', focus: 'bio.nucleus',
    modes: ['section', 'labels'], process: 'bio.respiration', step: 1, view: 'lesson', lessonStep: 3,
  };

  it('round-trips a full state', () => {
    expect(parseStateUrl(buildStateUrl(full))).toEqual(full);
  });

  it('accepts absolute URLs and hashes', () => {
    expect(parseStateUrl('https://bilig.kg/ky/bio/g7/animal-cell?focus=bio.nucleus#x')).toEqual({
      lang: 'ky', subjectKey: 'bio', grade: 'g7', topicKey: 'animal-cell', focus: 'bio.nucleus',
    });
  });

  it('parses the grade-less shape', () => {
    expect(parseStateUrl('/ru/bio/animal-cell')).toEqual({ lang: 'ru', subjectKey: 'bio', topicKey: 'animal-cell' });
  });

  it('rejects unknown language, bad grade, bad keys and wrong segment counts', () => {
    expect(parseStateUrl('/de/bio/animal-cell')).toBeNull();
    expect(parseStateUrl('/ky/bio/seven/animal-cell')).toBeNull();
    expect(parseStateUrl('/ky/Bio/animal-cell')).toBeNull();
    expect(parseStateUrl('/ky/bio')).toBeNull();
    expect(parseStateUrl('/ky/bio/g7/animal-cell/extra')).toBeNull();
    expect(parseStateUrl('/ky/bio/%E0%A4%A')).toBeNull();
  });

  it('drops invalid optional params instead of failing the link', () => {
    const s = parseStateUrl('/ky/bio/animal-cell?step=abc&focus=Not%20A%20Key&view=weird&lesson=-1')!;
    expect(s).toEqual({ lang: 'ky', subjectKey: 'bio', topicKey: 'animal-cell' });
  });
});

describe('makeSnapshot (W-51: image + SceneState)', () => {
  it('keeps a deep copy of the state, adds camera, validates against the contract', () => {
    const state: SceneState = { lang: 'ky', subjectKey: 'bio', topicKey: 'animal-cell', focus: 'bio.nucleus', modes: ['section'] };
    const camera = { position: [0, 1, 5] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    const snap = makeSnapshot(state, 'data:image/webp;base64,AAAA', camera);
    expect(snap.image).toBe('data:image/webp;base64,AAAA');
    expect(snap.sceneState).toEqual({ ...state, camera });
    expect(snap.sceneState.modes).not.toBe(state.modes);
    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
    expect(makeSnapshot(state, 'x').sceneState).toEqual(state);
    expect(snapshotUrl(snap)).toBe('/ky/bio/animal-cell?focus=bio.nucleus&mode=section');
  });
});
