import { describe, expect, it } from 'vitest';
import { sceneStateUrl } from './urls';
import { isLessonView, withView } from './view';

describe('topic view mode in the URL (lesson by default)', () => {
  it('no param and the old ?view=lesson mean lesson; ?view=study explores', () => {
    expect(isLessonView(new URLSearchParams(''))).toBe(true);
    expect(isLessonView(new URLSearchParams('view=lesson'))).toBe(true);
    expect(isLessonView(new URLSearchParams('view=study'))).toBe(false);
  });

  it('switching keeps the other params; study drops the tour step, lesson drops view', () => {
    expect(withView(new URLSearchParams('focus=a&lesson=2'), false).toString()).toBe('focus=a&view=study');
    expect(withView(new URLSearchParams('focus=a&view=study'), true).toString()).toBe('focus=a');
    expect(withView(new URLSearchParams('view=lesson&lesson=2'), true).toString()).toBe('lesson=2');
  });

  it('a snapshot taken while exploring (or before the view was recorded) reopens in exploration', () => {
    const base = { lang: 'en', subjectKey: 'bio', grade: 'g7', topicKey: 'animal-cell' } as const;
    expect(sceneStateUrl({ ...base, focus: 'bio.nucleus' })).toBe('/en/bio/g7/animal-cell?focus=bio.nucleus&view=study');
    expect(sceneStateUrl({ ...base, view: 'study' })).toBe('/en/bio/g7/animal-cell?view=study');
    expect(sceneStateUrl({ ...base, view: 'lesson', lessonStep: 1 })).toBe('/en/bio/g7/animal-cell?view=lesson&lesson=1');
  });
});
