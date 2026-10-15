/**
 * URL state & snapshots (TZ W-05, W-51).
 *
 * W-05: language, topic, focused structure, mode, process step — in the URL
 * (`/ky/bio/g7/animal-cell?focus=bio.nucleus`). The state must round-trip so a
 * link can be sent to a class or pasted into a presentation.
 */
import {
  SceneStateSchema,
  isLang,
  type Camera,
  type SceneState,
  type Snapshot,
} from '@bilig/content-model';

export type { SceneState, Snapshot };

/**
 * Path `/:lang/:subject[/:grade]/:topic` + query:
 * `focus`, `mode` (comma tokens, see encodeModes), `process`, `step`,
 * `view=lesson`, `lesson` (tour step). Camera is never put in the URL.
 */
export function buildStateUrl(s: SceneState): string {
  const segments = [s.lang, s.subjectKey];
  if (s.grade) segments.push(s.grade);
  segments.push(s.topicKey);
  const path = '/' + segments.map(encodeURIComponent).join('/');

  const q = new URLSearchParams();
  if (s.focus) q.set('focus', s.focus);
  if (s.modes?.length) q.set('mode', s.modes.join(','));
  if (s.process) q.set('process', s.process);
  if (typeof s.step === 'number') q.set('step', String(s.step));
  if (s.view === 'lesson') q.set('view', 'lesson');
  if (typeof s.lessonStep === 'number') q.set('lesson', String(s.lessonStep));
  const query = q.toString().replace(/%2C/g, ',');
  return query ? `${path}?${query}` : path;
}

const intParam = (v: string | null): number | undefined =>
  v !== null && /^\d+$/.test(v) ? Number(v) : undefined;

/**
 * Parse a scene-state URL (path + optional query; a full URL or hash is fine).
 * Returns null when the path is not `/:lang/:subject[/:grade]/:topic` or keys are invalid.
 * Invalid optional params are dropped rather than failing the whole link.
 */
export function parseStateUrl(url: string): SceneState | null {
  const noHash = url.split('#')[0];
  const withoutOrigin = noHash.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const [rawPath, rawQuery = ''] = withoutOrigin.split('?');
  let parts: string[];
  try {
    parts = rawPath.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (parts.length < 3 || parts.length > 4) return null;
  const [lang, subjectKey] = parts;
  if (!isLang(lang)) return null;
  const grade = parts.length === 4 ? parts[2] : undefined;
  const topicKey = parts[parts.length - 1];

  const q = new URLSearchParams(rawQuery);
  const candidate: Record<string, unknown> = { lang, subjectKey, grade, topicKey };
  const base = SceneStateSchema.safeParse(candidate);
  if (!base.success) return null;

  const optional: Partial<SceneState> = {
    focus: q.get('focus') ?? undefined,
    modes: q.get('mode')?.split(',').filter(Boolean),
    process: q.get('process') ?? undefined,
    step: intParam(q.get('step')),
    view: q.get('view') === 'lesson' ? 'lesson' : undefined,
    lessonStep: intParam(q.get('lesson')),
  };
  const out: SceneState = { ...base.data };
  for (const [k, v] of Object.entries(optional)) {
    if (v === undefined) continue;
    const probe = SceneStateSchema.safeParse({ ...base.data, [k]: v });
    if (probe.success) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** W-51: a snapshot keeps the image and a deep copy of the SceneState (+ camera). */
export function makeSnapshot(state: SceneState, image: string, camera?: Camera): Snapshot {
  const sceneState = structuredClone(camera ? { ...state, camera } : state);
  return { image, sceneState };
}

/** URL for reopening a snapshot live (drops the camera, which the URL cannot carry). */
export const snapshotUrl = (snap: Snapshot): string => buildStateUrl(snap.sceneState);
