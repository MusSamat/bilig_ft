import { describe, it, expect } from 'vitest';
import {
  buildStateUrl,
  parseStateUrl,
  makeSnapshot,
  type SceneState,
} from './state.js';

describe('buildStateUrl (TZ W-05 example /ky/bio/g7/animal-cell?focus=bio.nucleus)', () => {
  it('matches the TZ reference URL exactly', () => {
    const s: SceneState = {
      lang: 'ky',
      subjectSlug: 'bio',
      grade: 'g7',
      topicSlug: 'animal-cell',
      focus: 'bio.nucleus',
    };
    expect(buildStateUrl(s)).toBe('/ky/bio/g7/animal-cell?focus=bio.nucleus');
  });

  it('omits grade when absent and omits default view/step', () => {
    expect(
      buildStateUrl({ lang: 'ru', subjectSlug: 'bio', topicSlug: 'animal-cell' }),
    ).toBe('/ru/bio/animal-cell');
  });

  it('encodes mode, step and lesson view', () => {
    const url = buildStateUrl({
      lang: 'en',
      subjectSlug: 'bio',
      topicSlug: 'animal-cell',
      mode: 'section',
      step: 2,
      view: 'lesson',
    });
    const parsed = parseStateUrl(url)!;
    expect(parsed.mode).toBe('section');
    expect(parsed.step).toBe(2);
    expect(parsed.view).toBe('lesson');
  });
});

describe('parseStateUrl', () => {
  it('round-trips a full state (TZ: link can be sent and pasted)', () => {
    const s: SceneState = {
      lang: 'ky',
      subjectSlug: 'bio',
      grade: 'g7',
      topicSlug: 'animal-cell',
      focus: 'bio.nucleus',
      mode: 'section',
      step: 1,
      view: 'lesson',
    };
    expect(parseStateUrl(buildStateUrl(s))).toEqual(s);
  });

  it('parses the grade-less shape', () => {
    expect(parseStateUrl('/ru/bio/animal-cell')).toEqual({
      lang: 'ru',
      subjectSlug: 'bio',
      grade: undefined,
      topicSlug: 'animal-cell',
      focus: undefined,
      mode: undefined,
      step: undefined,
      view: undefined,
    });
  });

  it('rejects an unknown language', () => {
    expect(parseStateUrl('/de/bio/animal-cell')).toBeNull();
  });

  it('rejects a path with too few or too many segments', () => {
    expect(parseStateUrl('/ky/bio')).toBeNull();
    expect(parseStateUrl('/ky/bio/g7/animal-cell/extra')).toBeNull();
  });

  it('ignores a non-numeric step', () => {
    expect(parseStateUrl('/ky/bio/animal-cell?step=abc')!.step).toBeUndefined();
  });
});

describe('makeSnapshot (TZ W-51: snapshot keeps SceneState + image)', () => {
  it('captures a copy of the state and the image url', () => {
    const state: SceneState = {
      lang: 'ky',
      subjectSlug: 'bio',
      topicSlug: 'animal-cell',
      focus: 'bio.nucleus',
    };
    const snap = makeSnapshot(state, 'https://cdn/x.webp');
    expect(snap.imageUrl).toBe('https://cdn/x.webp');
    expect(snap.sceneState).toEqual(state);
    expect(snap.sceneState).not.toBe(state); // a copy, not a reference
  });
});
