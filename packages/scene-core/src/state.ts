/**
 * URL state & scene snapshots (TZ W-05, W-51).
 *
 * W-05: "Адрес состояния: язык, тема, выбранная структура, режим, шаг процесса —
 * в URL (/ky/bio/g7/animal-cell?focus=bio.nucleus)". A link can be sent to a
 * class and pasted into a presentation, so the state must round-trip exactly.
 */
import type { Lang } from '@bilig/content-model';
import { LANGS } from '@bilig/content-model';

export type ViewMode = 'study' | 'lesson';

export interface SceneState {
  lang: Lang;
  subjectSlug: string;
  grade?: string;
  topicSlug: string;
  /** Selected concept key, URL param `focus` (TZ W-05 example). */
  focus?: string;
  /** Active view mode id (labels/rotate/…); omitted when default. */
  mode?: string;
  /** Current process step index; omitted when none. */
  step?: number;
  /** Study vs lesson shell (TZ W-01). */
  view?: ViewMode;
}

/** Build the path + query for a scene state (TZ W-05). */
export function buildStateUrl(s: SceneState): string {
  const segments = [s.lang, s.subjectSlug];
  if (s.grade) segments.push(s.grade);
  segments.push(s.topicSlug);
  const path = '/' + segments.map(encodeURIComponent).join('/');

  const q = new URLSearchParams();
  if (s.focus) q.set('focus', s.focus);
  if (s.mode) q.set('mode', s.mode);
  if (typeof s.step === 'number') q.set('step', String(s.step));
  if (s.view && s.view !== 'study') q.set('view', s.view);
  const query = q.toString();
  return query ? `${path}?${query}` : path;
}

const isLang = (v: string): v is Lang => (LANGS as string[]).includes(v);

/**
 * Parse a scene-state URL back into a SceneState. Returns null when the path
 * doesn't match the expected `/:lang/:subject[/:grade]/:topic` shape.
 */
export function parseStateUrl(url: string): SceneState | null {
  const [rawPath, rawQuery = ''] = url.split('?');
  const parts = rawPath.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 3 || parts.length > 4) return null;
  const [lang, subjectSlug, maybeGradeOrTopic, maybeTopic] = parts;
  if (!isLang(lang)) return null;

  const hasGrade = parts.length === 4;
  const grade = hasGrade ? maybeGradeOrTopic : undefined;
  const topicSlug = hasGrade ? maybeTopic : maybeGradeOrTopic;

  const q = new URLSearchParams(rawQuery);
  const stepRaw = q.get('step');
  const step = stepRaw !== null && /^\d+$/.test(stepRaw) ? Number(stepRaw) : undefined;
  const view = q.get('view');

  return {
    lang,
    subjectSlug,
    grade,
    topicSlug,
    focus: q.get('focus') ?? undefined,
    mode: q.get('mode') ?? undefined,
    step,
    view: view === 'lesson' ? 'lesson' : undefined,
  };
}

/**
 * A snapshot for a presentation slide (TZ W-51): keeps the SceneState so the
 * slide can be reopened live, plus a rendered image url.
 */
export interface Snapshot {
  sceneState: SceneState;
  imageUrl: string;
}

export function makeSnapshot(state: SceneState, imageUrl: string): Snapshot {
  return { sceneState: { ...state }, imageUrl };
}
