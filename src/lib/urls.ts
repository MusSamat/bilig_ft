/** URL helpers (TZ W-05): language segment switching and topic links. */
import { gradeSegment, type Catalog, type Lang } from '@bilig/content-model';
import { buildStateUrl } from '@bilig/scene-core';
import { isUiLang } from '../config';

/**
 * Same page in another language: replaces the leading `/:lang` segment and
 * keeps the rest of the path, the query (focus, mode, step…) and the hash.
 */
export function switchLangPath(pathname: string, search: string, hash: string, lang: Lang): string {
  const parts = pathname.split('/');
  if (isUiLang(parts[1])) parts[1] = lang;
  else parts.splice(1, 0, lang);
  const path = parts.join('/').replace(/\/+$/, '') || `/${lang}`;
  return path + (search || '') + (hash || '');
}

/** Canonical topic URL from the catalog (`/:lang/:subject/g7/:topic`). */
export function topicPath(catalog: Catalog | undefined, lang: Lang, topicKey: string, subjectKey?: string): string {
  const topic = catalog?.topics.find((t) => t.key === topicKey);
  const unit = topic && catalog?.units.find((u) => u.key === topic.unitKey);
  const course = unit && catalog?.courses.find((c) => c.key === unit.courseKey);
  return buildStateUrl({
    lang,
    subjectKey: topic?.subjectKey ?? subjectKey ?? 'topic',
    grade: course ? gradeSegment(course.grade) : undefined,
    topicKey,
  });
}

/** Path without the language segment (stored for «recent topics»). */
export const stripLang = (pathname: string): string => {
  const parts = pathname.split('/');
  return isUiLang(parts[1]) ? '/' + parts.slice(2).join('/') : pathname;
};
