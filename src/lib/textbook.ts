/** Textbook display helpers (contract 0.5.0): short titles, page ranges, places of a topic. */
import type { TFunction } from 'i18next';
import { t as tr, type Lang, type PageRange, type Textbook, type TextbookPlace } from '@bilig/content-model';
import { chapterAnchor } from '../state/textbook';

/**
 * «Табигый илимдер 8»: `shortTitle` when the textbook has one; otherwise the title up to its first comma (the full title repeats
 * grade and part: «Табигый илимдер, 8-класс, 1-бөлүк») followed by the grade.
 */
export function textbookShortTitle(tb: Pick<Textbook, 'title' | 'shortTitle' | 'grade'>, lang: Lang, t: TFunction): string {
  if (tb.shortTitle) return tr(tb.shortTitle, lang);
  const full = tr(tb.title, lang);
  const head = full.split(',')[0].trim();
  return head && head !== full ? t('textbook.short', { title: head, grade: tb.grade }) : full;
}

/** «стр. 176–185» / «176–185-беттер» / «pp. 176–185». */
export function pagesLabel(pages: PageRange | undefined, t: TFunction): string | null {
  if (!pages) return null;
  return pages.from === pages.to ? t('textbook.page', { from: pages.from }) : t('textbook.pages', { from: pages.from, to: pages.to });
}

/** Textbook page URL, optionally at a chapter. */
export const textbookPath = (lang: Lang, key: string, chapterKey?: string): string =>
  `/${lang}/textbooks/${encodeURIComponent(key)}${chapterKey ? `#${chapterAnchor(chapterKey)}` : ''}`;

/** «Табигый илимдер 8 · § 8.1 · стр. 176–185». */
export function placeLabel(tb: Textbook, place: TextbookPlace, lang: Lang, t: TFunction): string {
  return [textbookShortTitle(tb, lang, t), place.number ? `§ ${place.number}` : null, pagesLabel(place.pages, t)].filter(Boolean).join(' · ');
}
