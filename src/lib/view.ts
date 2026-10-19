/**
 * Topic page mode in the URL: «Сабак» (guided lesson) is the default, so a
 * topic link without `view` opens the lesson; `?view=study` is free
 * exploration. Old links with `?view=lesson` still mean the lesson.
 */
export const VIEW_PARAM = 'view';
export const STUDY_VIEW = 'study';

/** True unless the query explicitly asks for exploration (`?view=study`). */
export const isLessonView = (params: URLSearchParams): boolean => params.get(VIEW_PARAM) !== STUDY_VIEW;

/** The query for the other mode: lesson drops `view` (and keeps the tour step), study sets `view=study` and drops `lesson`. */
export function withView(params: URLSearchParams, lesson: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (lesson) next.delete(VIEW_PARAM);
  else {
    next.set(VIEW_PARAM, STUDY_VIEW);
    next.delete('lesson');
  }
  return next;
}
