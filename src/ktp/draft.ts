/**
 * The contents draft as the review table edits it (contract 0.9.2
 * `TextbookDraft`): every row has a stable id, pages are text fields, and the
 * warnings of POST /ktp/contents travel with their rows when rows are added or
 * removed. `toDraft` validates with `TextbookDraftSchema` and maps the issues
 * back onto the rows.
 */
import { TextbookDraftSchema, type DraftLesson, type KtpContentsResponse, type TextbookDraft } from '@bilig/content-model/api';
import type { Lang } from '@bilig/content-model';

export type DraftWarning = KtpContentsResponse['warnings'][number]['code'];
export type LessonKind = DraftLesson['kind'];
export const LESSON_KINDS: LessonKind[] = ['lesson', 'review', 'extra'];

export interface EditLesson {
  id: string;
  number: string;
  kind: LessonKind;
  title: string;
  from: string;
  to: string;
  topicKey: string | null;
  warnings: DraftWarning[];
}

export interface EditChapter {
  id: string;
  number: string;
  title: string;
  lessons: EditLesson[];
  warnings: DraftWarning[];
}

export interface EditDraft {
  title: string;
  /** '' = not known. */
  grade: string;
  lang: Lang;
  /** '' = not known. */
  subjectKey: string;
  chapters: EditChapter[];
}

let seq = 0;
const uid = (p: string) => `${p}${++seq}`;

export const newLesson = (number = ''): EditLesson => ({
  id: uid('l'),
  number,
  kind: 'lesson',
  title: '',
  from: '',
  to: '',
  topicKey: null,
  warnings: [],
});
export const newChapter = (number = ''): EditChapter => ({
  id: uid('c'),
  number,
  title: '',
  lessons: [newLesson()],
  warnings: [],
});

export function fromContents(res: KtpContentsResponse): EditDraft {
  const d = res.draft;
  const at = (ci: number, li?: number) => res.warnings.filter((w) => w.chapter === ci && w.lesson === li).map((w) => w.code);
  return {
    title: d.title,
    grade: d.grade ? String(d.grade) : '',
    lang: d.lang,
    subjectKey: d.subjectKey ?? '',
    chapters: d.chapters.map((c, ci) => ({
      id: uid('c'),
      number: c.number,
      title: c.title,
      warnings: at(ci),
      lessons: c.lessons.map((l, li) => ({
        id: uid('l'),
        number: l.number,
        kind: l.kind,
        title: l.title,
        from: l.pages ? String(l.pages.from) : '',
        to: l.pages ? String(l.pages.to) : '',
        topicKey: l.topicKey ?? null,
        warnings: at(ci, li),
      })),
    })),
  };
}

/** Warnings still worth showing: «no page» goes once the pages are filled in. */
export const liveWarnings = (l: EditLesson): DraftWarning[] => l.warnings.filter((w) => !(w === 'no_pages' && l.from.trim()));

/** Warnings shown on a chapter row: «no lessons» goes once a lesson has a title. */
export const liveChapterWarnings = (c: EditChapter): DraftWarning[] => c.warnings.filter((w) => !(w === 'no_lessons' && c.lessons.some((l) => l.title.trim())));

export const warningCount = (d: EditDraft): number => d.chapters.reduce((n, c) => n + liveChapterWarnings(c).length + c.lessons.reduce((m, l) => m + liveWarnings(l).length, 0), 0);

const num = (s: string): number => (s.trim() && /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

function pagesOf(l: EditLesson): DraftLesson['pages'] | 'bad' | undefined {
  if (!l.from.trim() && !l.to.trim()) return undefined;
  const from = num(l.from || l.to);
  const to = num(l.to || l.from);
  if (Number.isNaN(from) || Number.isNaN(to)) return 'bad';
  return { from, to };
}

/** Row errors by row id: an i18n key (`ktp.book.review.err.*`). */
export type DraftErrors = Record<string, string>;

/** The draft for POST /ktp/from-textbook, or the errors to show on the rows. */
export function toDraft(d: EditDraft): { ok: true; draft: TextbookDraft } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const raw = {
    title: d.title,
    grade: d.grade ? Number(d.grade) : null,
    lang: d.lang,
    subjectKey: d.subjectKey || null,
    chapters: d.chapters.map((c) => ({
      number: c.number.trim(),
      title: c.title,
      lessons: c.lessons.map((l) => {
        const pages = pagesOf(l);
        if (pages === 'bad') errors[l.id] = 'ktp.book.review.err.pages';
        return {
          number: l.number.trim(),
          kind: l.kind,
          title: l.title,
          ...(pages && pages !== 'bad' ? { pages } : {}),
          ...(l.topicKey ? { topicKey: l.topicKey } : {}),
        };
      }),
    })),
  };
  const parsed = TextbookDraftSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [top, ci, sub, li, field] = issue.path;
      if (top === 'title') errors.title ??= 'ktp.book.review.err.title';
      else if (top === 'grade') errors.grade ??= 'ktp.book.review.err.grade';
      else if (top === 'chapters' && typeof ci === 'number') {
        const c = d.chapters[ci];
        if (sub === 'lessons' && typeof li === 'number' && c?.lessons[li]) errors[c.lessons[li].id] ??= field === 'pages' ? 'ktp.book.review.err.pages' : 'ktp.book.review.err.lesson';
        else if (c) errors[c.id] ??= sub === 'lessons' ? 'ktp.book.review.err.noLessons' : 'ktp.book.review.err.chapter';
      } else if (top === 'chapters') errors.chapters ??= 'ktp.book.review.err.noChapters';
    }
  }
  if (!parsed.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, draft: parsed.data };
}

export const lessonCount = (d: EditDraft): number => d.chapters.reduce((n, c) => n + c.lessons.length, 0);
