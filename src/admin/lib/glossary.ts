/** Glossary term highlighting for the translation table (A-11 «подсветка терминов глоссария»). */
import type { GlossaryTerm, Lang } from '@bilig/content-model';

export interface Segment {
  text: string;
  term?: GlossaryTerm;
}

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Split `text` into plain segments and glossary-term matches for `lang`
 * (case-insensitive, whole-word-ish; longest term wins on overlap).
 */
export function highlightTerms(text: string, terms: readonly GlossaryTerm[], lang: Lang): Segment[] {
  if (!text || !terms.length) return [{ text }];
  const lower = text.toLocaleLowerCase();
  const hits: { start: number; end: number; term: GlossaryTerm }[] = [];
  for (const term of terms) {
    const needle = term[lang]?.toLocaleLowerCase();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      // Allow inflected endings (Russian/Kyrgyz suffixes) but not a word continuing before the term.
      if (!isWord(lower[i - 1])) hits.push({ start: i, end, term });
      from = end;
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Segment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start < pos) continue;
    if (h.start > pos) out.push({ text: text.slice(pos, h.start) });
    out.push({ text: text.slice(h.start, h.end), term: h.term });
    pos = h.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
