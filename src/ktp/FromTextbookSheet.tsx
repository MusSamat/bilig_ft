/**
 * «Окуу китебинен КТП түзүү» (contract 0.9.2): a preliminary КТП from a
 * textbook in three steps, in a sheet.
 *  1. The book: a Bilig catalog textbook (grouped by the teacher's subjects —
 *     choosing one skips step 2), or the teacher's own book (PDF / .docx /
 *     photos of the «Мазмуну» pages), prepared in the browser and read by
 *     POST /ktp/contents.
 *  2. The contents to check (own book only): an editable table of chapters and
 *     lessons with the server's warnings on their rows, validated with
 *     `TextbookDraftSchema`.
 *  3. The number of lessons: hours a week × weeks (no dates: every teacher's
 *     timetable differs), the school year and optional class labels →
 *     POST /ktp/from-textbook → the plan page.
 * v0.9.3: step 1 also lists the published books of the Bilig library
 * (`bookId`); a class's subject card opens the sheet on step 3 with the
 * class's book and the class already chosen.
 * Lazy chunk of the КТП tab; pdf.js is a further lazy chunk (`bookPdf.ts`).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { t as tr, textbookSubjects, type Textbook } from '@bilig/content-model';
import { SCHOOL_WEEKS, type Book as LibraryBook, type KtpContentsResponse, type KtpFromTextbookRequest, type TeachingPlan } from '@bilig/content-model/api';
import { isApiError } from '../api/client';
import { useCatalog, useTextbooks } from '../api/content';
import { useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { errorKey } from '../cabinet/format';
import { classSubjectKeys, useClasses } from '../cabinet/teacher/ClassesSection';
import { Chip, EmptyState, ErrorState, Field, Loading, Sheet, Tabs, btn, cx, described, iconBtn, inputCls } from '../cabinet/teacher/ui';
import { useLang } from '../lib/hooks';
import { BOOK_ACCEPT, BookError, CONTENTS_MAX_IMAGES, bookKind, checkBookFiles, prepareBook, type PrepProgress } from './book';
import { useKtpContents, useKtpFromTextbook } from './api';
import { BookCover, useLibraryBooks } from './library';
import {
  LESSON_KINDS,
  fromContents,
  lessonCount,
  liveChapterWarnings,
  liveWarnings,
  newChapter,
  newLesson,
  toDraft,
  warningCount,
  type DraftErrors,
  type EditChapter,
  type EditDraft,
  type EditLesson,
} from './draft';
import { KTP_MAX_BYTES, classLabel, currentSchoolYear } from './model';

const MB = Math.round(KTP_MAX_BYTES / (1024 * 1024));
const MAX_CLASSES = 8;
const HOURS = [1, 2, 3, 4, 5, 6];

/** The chosen book: a catalog textbook (step 2 skipped) or the checked contents of the teacher's own. */
type Book =
  | { kind: 'catalog'; textbook: Textbook; subjectKey: string | null }
  | { kind: 'library'; book: LibraryBook }
  | {
      kind: 'own';
      draft: EditDraft;
      fileName: string;
      source: KtpContentsResponse['source'];
    };

type Step = 1 | 2 | 3;

export interface FromTextbookInitial {
  /** A published library book: the sheet opens on step 3. */
  book: LibraryBook;
  /** Class labels to prefill («7А»). */
  classes?: string[];
}

export default function FromTextbookSheet({ onClose, initial }: { onClose: () => void; initial?: FromTextbookInitial }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(initial ? 3 : 1);
  const [book, setBook] = useState<Book | null>(initial ? { kind: 'library', book: initial.book } : null);
  const [tab, setTab] = useState<'catalog' | 'own'>('catalog');
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const own = book?.kind === 'own';
  const done = (plan: TeachingPlan) => {
    onClose();
    navigate(`/${lang}/teacher/ktp/${plan.id}`);
  };

  return (
    <Sheet title={t('ktp.book.title')} onClose={onClose} wide>
      <StepHeader step={step} skipped={book?.kind === 'catalog' || book?.kind === 'library'} />
      <h3 ref={heading} tabIndex={-1} className="m-0 font-serif text-lg font-bold text-ink outline-none" data-testid="ktp-book-step">
        {t('ktp.book.stepOf', {
          n: step,
          total: 3,
          name: t(`ktp.book.step.${step}`),
        })}
      </h3>
      {step === 1 && (
        <BookStep
          tab={tab}
          onTab={setTab}
          onCatalog={(textbook, subjectKey) => {
            setBook({ kind: 'catalog', textbook, subjectKey });
            setStep(3);
          }}
          onLibrary={(b) => {
            setBook({ kind: 'library', book: b });
            setStep(3);
          }}
          onOwn={(res, fileName) => {
            setBook({
              kind: 'own',
              draft: fromContents(res),
              fileName,
              source: res.source,
            });
            setStep(2);
          }}
        />
      )}
      {step === 2 && book?.kind === 'own' && <ReviewStep book={book} onChange={(draft) => setBook({ ...book, draft })} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && book && <LessonsStep book={book} initialClasses={initial?.classes} onBack={() => setStep(own ? 2 : 1)} onDone={done} />}
    </Sheet>
  );
}

/* ------------------------------------------------------------ step header */

function StepHeader({ step, skipped }: { step: Step; skipped: boolean }): JSX.Element {
  const { t } = useTranslation();
  return (
    <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label={t('ktp.book.steps')}>
      {([1, 2, 3] as const).map((n) => {
        const current = n === step;
        const past = n < step;
        const skip = n === 2 && skipped;
        return (
          <li key={n} aria-current={current ? 'step' : undefined} className={cx('flex min-w-0 items-center gap-2 rounded-lg p-2 text-sm font-semibold', current ? 'bg-soft text-ink' : 'text-muted')}>
            <span
              className={cx(
                'inline-flex size-8 flex-none items-center justify-center rounded-pill border text-base',
                current ? 'border-transparent bg-accent text-on' : past && !skip ? 'border-ok text-ok' : 'border-line',
              )}
              aria-hidden="true"
            >
              {past && !skip ? <Icon name="check" className="sm" /> : n}
            </span>
            <span className="min-w-0 truncate">{t(`ktp.book.step.${n}`)}</span>
            <span className="visually-hidden">{skip ? t('ktp.book.skipped') : past ? t('ktp.book.done') : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ step 1: book */

/** Subjects the teacher teaches: profile, licences and class subjects, in catalog order. */
function useTeacherSubjects(): string[] {
  const me = useSession((s) => s.me);
  const { data: catalog } = useCatalog();
  const classes = useClasses();
  return useMemo(() => {
    const keys = new Set<string>([
      ...(me?.teaching?.subjects ?? []),
      ...(me?.licenses ?? []).flatMap((l) => l.subjects),
      ...(classes.data?.pages.flatMap((p) => p.items.flatMap(classSubjectKeys)) ?? []),
    ]);
    const order = new Map((catalog?.subjects ?? []).map((s) => [s.key, s.order]));
    return [...keys].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [me, catalog, classes.data]);
}

function BookStep({
  tab,
  onTab,
  onCatalog,
  onLibrary,
  onOwn,
}: {
  tab: 'catalog' | 'own';
  onTab: (k: 'catalog' | 'own') => void;
  onCatalog: (tb: Textbook, subjectKey: string | null) => void;
  onLibrary: (b: LibraryBook) => void;
  onOwn: (res: KtpContentsResponse, fileName: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4">
      <Tabs
        items={[
          { key: 'catalog', label: t('ktp.book.catalog.tab'), icon: 'book' },
          { key: 'own', label: t('ktp.book.own.tab'), icon: 'upload' },
        ]}
        value={tab}
        onChange={onTab}
        label={t('ktp.book.which')}
        idBase="ktp-book"
      />
      <div role="tabpanel" id="ktp-book-panel" aria-labelledby={`ktp-book-tab-${tab}`} className="grid gap-4">
        {tab === 'catalog' ? <CatalogBooks onPick={onCatalog} onLibrary={onLibrary} /> : <OwnBook onRead={onOwn} />}
      </div>
    </div>
  );
}

const lessonsOf = (tb: Textbook, subjectKey: string | null): number => tb.chapters.filter((c) => !subjectKey || c.subjectKey === subjectKey).reduce((n, c) => n + c.lessons.length, 0);

function CatalogBooks({ onPick, onLibrary }: { onPick: (tb: Textbook, subjectKey: string | null) => void; onLibrary: (b: LibraryBook) => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const books = useTextbooks();
  const library = useLibraryBooks({});
  const { data: catalog } = useCatalog();
  const mine = useTeacherSubjects();
  const [all, setAll] = useState(false);
  const items = books.data?.items ?? [];
  const subjectTitle = (k: string) => {
    const s = catalog?.subjects.find((x) => x.key === k);
    return s ? tr(s.title, lang) : k;
  };
  const groups = mine
    .map((k) => ({
      key: k,
      books: items.filter((tb) => textbookSubjects(tb).includes(k)),
    }))
    .filter((g) => g.books.length);
  const others = items.filter((tb) => !textbookSubjects(tb).some((k) => mine.includes(k)));

  // The teacher's subjects first, then the rest; newest first within (the server's order).
  const libItems = [...(library.data?.items ?? [])].sort((a, b) => Number(!mine.includes(a.subjectKey)) - Number(!mine.includes(b.subjectKey)));

  if (books.isLoading) return <Loading rows={2} />;
  if (books.isError) return <ErrorState text={t('ktp.book.catalog.loadError')} onRetry={() => void books.refetch()} />;
  if (!items.length && !libItems.length) return <EmptyState icon="book" title={t('ktp.book.catalog.empty')} text={t('ktp.book.catalog.emptyText')} />;

  const list = (bks: Textbook[], subjectKey: string | null) => (
    <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
      {bks.map((tb) => {
        const integrated = textbookSubjects(tb).length > 1;
        const sk = integrated ? subjectKey : null;
        const name = tr(tb.shortTitle ?? tb.title, lang);
        const meta = [t('textbook.grade', { grade: tb.grade }), integrated && sk ? subjectTitle(sk) : null, t('ktp.book.catalog.lessons', { count: lessonsOf(tb, sk) })].filter(Boolean).join(' · ');
        return (
          <li key={tb.key}>
            <button
              type="button"
              className="flex min-h-11 w-full items-start gap-3 rounded-lg border border-line bg-chip p-3 text-start text-ink transition-colors hover:border-accent"
              aria-label={t('ktp.book.catalog.pick', { name, meta })}
              onClick={() => onPick(tb, sk)}
            >
              <span className="inline-flex size-10 flex-none items-center justify-center rounded-md bg-soft text-accent" aria-hidden="true">
                <Icon name="book" />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <b className="text-base">{name}</b>
                <span className="text-sm text-muted">{meta}</span>
              </span>
              <Icon name="chevron-right" className="mt-2 text-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="grid gap-4">
      <p className="m-0 text-base text-muted">{t('ktp.book.catalog.lead')}</p>
      {libItems.length > 0 && (
        <section className="grid gap-2" aria-labelledby="ktp-book-library">
          <h4 id="ktp-book-library" className="m-0 text-sm font-semibold text-muted">
            {t('ktp.book.library.title')}
          </h4>
          <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
            {libItems.map((b) => {
              const meta = [t('textbook.grade', { grade: b.grade }), subjectTitle(b.subjectKey), b.lang.toUpperCase(), t('ktp.book.catalog.lessons', { count: b.sectionCount })].join(' · ');
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-start gap-3 rounded-lg border border-line bg-chip p-3 text-start text-ink transition-colors hover:border-accent"
                    aria-label={t('ktp.book.catalog.pick', { name: b.title, meta })}
                    onClick={() => onLibrary(b)}
                  >
                    <BookCover book={b} className="w-12 flex-none" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <b className="text-base">{b.title}</b>
                      <span className="text-sm text-muted">{meta}</span>
                    </span>
                    <Icon name="chevron-right" className="mt-2 text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key} className="grid gap-2" aria-labelledby={`ktp-book-subj-${g.key}`}>
          <h4 id={`ktp-book-subj-${g.key}`} className="m-0 text-sm font-semibold text-muted">
            {subjectTitle(g.key)}
          </h4>
          {list(g.books, g.key)}
        </section>
      ))}
      {others.length > 0 &&
        (groups.length === 0 || all ? (
          <section className="grid gap-2" aria-labelledby="ktp-book-others">
            <h4 id="ktp-book-others" className="m-0 text-sm font-semibold text-muted">
              {t(groups.length ? 'ktp.book.catalog.others' : 'ktp.book.catalog.all')}
            </h4>
            {list(others, null)}
          </section>
        ) : (
          <button type="button" className={btn('ghost', 'justify-self-start')} onClick={() => setAll(true)}>
            <Icon name="chevron-down" className="sm" />
            {t('ktp.book.catalog.showOthers', { count: others.length })}
          </button>
        ))}
    </div>
  );
}

type Prep = { k: 'idle'; error: string | null } | { k: 'preparing'; p: PrepProgress | null } | { k: 'reading'; images: boolean };

/** The message for a failed preparation or POST /ktp/contents. */
function contentsError(e: unknown, t: TFunction): string {
  if (e instanceof BookError) return t(e.i18nKey, { max: CONTENTS_MAX_IMAGES, mb: MB });
  if (isApiError(e)) {
    if (e.code === 'tutor_unavailable' || e.status === 503) return t('ktp.book.err.tutor');
    if (e.code === 'rate_limited') return t('ktp.book.err.rateLimited');
    if (e.code === 'validation_failed') return t('ktp.book.err.validation');
    if (e.code === 'payload_too_large') return t('ktp.book.err.tooLarge');
  }
  return `${t('ktp.book.err.failed')}: ${t(errorKey(e))}`;
}

function OwnBook({ onRead }: { onRead: (res: KtpContentsResponse, fileName: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const contents = useKtpContents();
  const [files, setFiles] = useState<File[]>([]);
  const [prep, setPrep] = useState<Prep>({ k: 'idle', error: null });
  const alive = useRef(true);
  // Set on mount too: React StrictMode (dev) runs the cleanup and the effect again, and a ref that is only
  // cleared would stay false — the sheet would then ignore its own progress and result.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const busy = prep.k !== 'idle';

  const pick = (list: FileList | null) => {
    const next = [...(list ?? [])];
    const bad = checkBookFiles(next);
    setFiles(bad ? [] : next);
    setPrep({
      k: 'idle',
      error: bad ? t(bad, { max: CONTENTS_MAX_IMAGES, mb: MB }) : null,
    });
  };

  const read = async () => {
    if (!files.length || busy) return;
    setPrep({ k: 'preparing', p: null });
    try {
      const body = await prepareBook(files, (p) => alive.current && setPrep({ k: 'preparing', p }));
      if (!alive.current) return;
      setPrep({ k: 'reading', images: !!body.images });
      const res = await contents.mutateAsync(body);
      if (alive.current) onRead(res, body.fileName);
    } catch (e) {
      if (alive.current) setPrep({ k: 'idle', error: contentsError(e, t) });
    }
  };

  const error = prep.k === 'idle' ? prep.error : null;
  return (
    <div className="grid gap-4">
      <p className="m-0 text-base text-muted">{t('ktp.book.own.lead')}</p>
      {busy ? (
        <div role="status" aria-live="polite" className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-soft px-4 py-8 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-panel text-accent" aria-hidden="true">
            <Icon name="sync" className="lg spin" />
          </span>
          <p className="m-0 text-lg font-semibold text-ink">
            {prep.k === 'reading'
              ? t('ktp.book.own.reading')
              : prep.p
                ? t('ktp.book.own.preparing', {
                    done: prep.p.done,
                    total: prep.p.total,
                  })
                : t('ktp.book.own.opening')}
          </p>
          {prep.k === 'preparing' && prep.p && <progress className="h-2 w-full max-w-80 accent-[var(--accent)]" max={prep.p.total} value={prep.p.done} aria-hidden="true" />}
          <p className="m-0 max-w-[48ch] text-base text-muted">{prep.k === 'reading' && prep.images ? t('ktp.book.own.readingImages') : t('ktp.book.own.readingHint')}</p>
        </div>
      ) : (
        <div className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center">
          <label className={cx(btn('secondary'), 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent')}>
            <Icon name="file" className="sm" />
            {t('ktp.book.own.choose')}
            <input
              className="visually-hidden"
              type="file"
              multiple
              accept={BOOK_ACCEPT}
              aria-label={t('ktp.book.own.inputLabel')}
              aria-describedby="ktp-book-hint ktp-book-error"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <span id="ktp-book-hint" className="max-w-[56ch] text-sm text-muted">
            {t('ktp.book.own.hint', { max: CONTENTS_MAX_IMAGES })}
          </span>
          {files.length > 0 && (
            <ul className="m-0 grid w-full list-none gap-1 p-0 text-start text-sm text-ink" aria-label={t('ktp.book.own.picked')}>
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-2 truncate">
                  <Icon name={bookKind(f) === 'image' ? 'camera' : 'file'} className="sm text-muted" />
                  <span className="truncate">{f.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p id="ktp-book-error" role="alert" className="m-0 text-base font-semibold text-bad empty:hidden">
        {error ?? ''}
      </p>
      {!busy && (
        <button type="button" className={btn('primary', 'justify-self-end')} disabled={!files.length} onClick={() => void read()}>
          <Icon name="search" className="sm" />
          {t('ktp.book.own.read')}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- step 2: review */

function ReviewStep({ book, onChange, onBack, onNext }: { book: Extract<Book, { kind: 'own' }>; onChange: (d: EditDraft) => void; onBack: () => void; onNext: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const [errors, setErrors] = useState<DraftErrors>({});
  const d = book.draft;
  const warnings = warningCount(d);
  const set = (patch: Partial<EditDraft>) => onChange({ ...d, ...patch });
  const setChapter = (id: string, patch: Partial<EditChapter>) =>
    set({
      chapters: d.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  const setLesson = (cid: string, lid: string, patch: Partial<EditLesson>) =>
    set({
      chapters: d.chapters.map((c) =>
        c.id === cid
          ? {
              ...c,
              lessons: c.lessons.map((l) => (l.id === lid ? { ...l, ...patch } : l)),
            }
          : c,
      ),
    });
  const subjects = [...(catalog?.subjects ?? [])].sort((a, b) => a.order - b.order);
  const errorCount = Object.keys(errors).length;

  const next = () => {
    const res = toDraft(d);
    if (!res.ok) return setErrors(res.errors);
    setErrors({});
    onNext();
  };

  return (
    <div className="grid gap-5" data-testid="ktp-book-review">
      <p className="m-0 text-base text-muted">{t(book.source === 'assistant' ? 'ktp.book.review.leadAssistant' : 'ktp.book.review.lead', { count: lessonCount(d) })}</p>
      {warnings > 0 && (
        <p className="m-0 flex items-start gap-2 rounded-lg border border-line border-l-4 border-l-gold bg-chip p-3 text-base text-ink">
          <Icon name="warn" className="mt-0.5 text-gold" />
          {t('ktp.book.review.warnings', { count: warnings })}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <Field id="ktp-draft-title" label={t('ktp.book.review.bookTitle')} error={errors.title ? t(errors.title) : null}>
          <input
            id="ktp-draft-title"
            className={inputCls}
            value={d.title}
            maxLength={300}
            aria-invalid={!!errors.title}
            aria-describedby={described('ktp-draft-title')}
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>
        <Field id="ktp-draft-grade" label={t('ktp.book.review.grade')}>
          <select id="ktp-draft-grade" className={inputCls} value={d.grade} onChange={(e) => set({ grade: e.target.value })}>
            <option value="">{t('ktp.book.review.unknown')}</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {t('teacher.gradeN', { n: i + 1 })}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ktp-draft-subject" label={t('ktp.book.review.subject')}>
          <select id="ktp-draft-subject" className={inputCls} value={d.subjectKey} onChange={(e) => set({ subjectKey: e.target.value })}>
            <option value="">{t('ktp.book.review.unknown')}</option>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {tr(s.title, lang)}
              </option>
            ))}
            {d.subjectKey && !subjects.some((s) => s.key === d.subjectKey) && <option value={d.subjectKey}>{d.subjectKey}</option>}
          </select>
        </Field>
      </div>

      <ol className="m-0 grid list-none gap-4 p-0" aria-label={t('ktp.book.review.chapters')}>
        {d.chapters.map((c) => (
          <ChapterRows
            key={c.id}
            chapter={c}
            errors={errors}
            canRemove={d.chapters.length > 1}
            onChange={(patch) => setChapter(c.id, patch)}
            onLesson={(lid, patch) => setLesson(c.id, lid, patch)}
            onRemove={() => set({ chapters: d.chapters.filter((x) => x.id !== c.id) })}
          />
        ))}
      </ol>
      <button
        type="button"
        className={btn('secondary', 'justify-self-start')}
        onClick={() =>
          set({
            chapters: [...d.chapters, newChapter(String(d.chapters.length + 1))],
          })
        }
      >
        <Icon name="plus" className="sm" />
        {t('ktp.book.review.addChapter')}
      </button>

      <p role="alert" className="m-0 text-base font-semibold text-bad empty:hidden">
        {errorCount ? t('ktp.book.review.fix', { count: errorCount }) : ''}
      </p>
      <Nav onBack={onBack}>
        <button type="button" className={btn('primary')} onClick={next}>
          {t('ktp.book.next')}
          <Icon name="arrow-right" className="sm" />
        </button>
      </Nav>
    </div>
  );
}

function WarningNote({ codes }: { codes: string[] }): JSX.Element | null {
  const { t } = useTranslation();
  if (!codes.length) return null;
  return (
    <span className="flex basis-full flex-wrap gap-1.5">
      {codes.map((w) => (
        <span key={w} className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-gold px-3 text-sm font-semibold text-ink">
          <Icon name="warn" className="sm text-gold" />
          {t(`ktp.book.warn.${w}`)}
        </span>
      ))}
    </span>
  );
}

function ChapterRows({
  chapter: c,
  errors,
  canRemove,
  onChange,
  onLesson,
  onRemove,
}: {
  chapter: EditChapter;
  errors: DraftErrors;
  canRemove: boolean;
  onChange: (p: Partial<EditChapter>) => void;
  onLesson: (lid: string, p: Partial<EditLesson>) => void;
  onRemove: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const warn = liveChapterWarnings(c);
  const err = errors[c.id];
  const name = c.title || c.number || t('ktp.book.review.chapterN', { n: '' });
  const topicTitle = (k: string) => {
    const tp = catalog?.topics.find((x) => x.key === k);
    return tp ? tr(tp.title, lang) : k;
  };
  return (
    <li className={cx('grid gap-3 rounded-lg border bg-chip p-3', err ? 'border-bad' : warn.length ? 'border-gold' : 'border-line')} data-testid="ktp-draft-chapter">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={cx(inputCls, 'w-16 flex-none')}
          value={c.number}
          maxLength={20}
          aria-label={t('ktp.book.review.chapterNumber', { name })}
          onChange={(e) => onChange({ number: e.target.value })}
        />
        <input
          className={cx(inputCls, 'min-w-0 flex-1 basis-48 font-semibold')}
          value={c.title}
          maxLength={300}
          aria-label={t('ktp.book.review.chapterTitle', { n: c.number })}
          aria-invalid={!!err}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        {canRemove && (
          <button type="button" className={iconBtn()} aria-label={t('ktp.book.review.removeChapter', { name })} title={t('ktp.book.review.removeChapter', { name })} onClick={onRemove}>
            <Icon name="trash" />
          </button>
        )}
        <WarningNote codes={warn} />
        {err && <span className="basis-full text-sm font-semibold text-bad">{t(err)}</span>}
      </div>
      <ul className="m-0 grid list-none gap-2 p-0" aria-label={t('ktp.book.review.lessonsOf', { name })}>
        {c.lessons.map((l, i) => {
          const lw = liveWarnings(l);
          const le = errors[l.id];
          const label = l.number ? `§ ${l.number}` : t('ktp.book.review.row', { n: i + 1 });
          return (
            <li
              key={l.id}
              className={cx('flex flex-wrap items-center gap-2 rounded-md border p-2', le ? 'border-bad' : lw.length ? 'border-gold' : 'border-transparent')}
              data-testid="ktp-draft-lesson"
            >
              <input
                className={cx(inputCls, 'w-16 flex-none px-2')}
                value={l.number}
                maxLength={20}
                aria-label={t('ktp.book.review.lessonNumber', { label })}
                onChange={(e) => onLesson(l.id, { number: e.target.value })}
              />
              <input
                className={cx(inputCls, 'min-w-0 flex-1 basis-56')}
                value={l.title}
                maxLength={500}
                aria-label={t('ktp.book.review.lessonTitle', { label })}
                aria-invalid={le === 'ktp.book.review.err.lesson'}
                onChange={(e) => onLesson(l.id, { title: e.target.value })}
              />
              <span className="flex flex-none items-center gap-1">
                <input
                  className={cx(inputCls, 'w-18 px-2')}
                  inputMode="numeric"
                  value={l.from}
                  aria-label={t('ktp.book.review.pageFrom', { label })}
                  aria-invalid={le === 'ktp.book.review.err.pages'}
                  onChange={(e) => onLesson(l.id, { from: e.target.value })}
                />
                <span aria-hidden="true" className="text-muted">
                  –
                </span>
                <input
                  className={cx(inputCls, 'w-18 px-2')}
                  inputMode="numeric"
                  value={l.to}
                  aria-label={t('ktp.book.review.pageTo', { label })}
                  aria-invalid={le === 'ktp.book.review.err.pages'}
                  onChange={(e) => onLesson(l.id, { to: e.target.value })}
                />
              </span>
              <select
                className={cx(inputCls, 'w-auto flex-none')}
                value={l.kind}
                aria-label={t('ktp.book.review.kind', { label })}
                onChange={(e) => onLesson(l.id, { kind: e.target.value as EditLesson['kind'] })}
              >
                {LESSON_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`ktp.book.kind.${k}`)}
                  </option>
                ))}
              </select>
              {c.lessons.length > 1 && (
                <button
                  type="button"
                  className={iconBtn()}
                  aria-label={t('ktp.book.review.removeLesson', { label })}
                  title={t('ktp.book.review.removeLesson', { label })}
                  onClick={() =>
                    onChange({
                      lessons: c.lessons.filter((x) => x.id !== l.id),
                    })
                  }
                >
                  <Icon name="x" />
                </button>
              )}
              {l.topicKey && (
                <Chip tone="ok" className="max-w-full">
                  <Icon name="cube" className="sm" />
                  <span className="visually-hidden">{t('ktp.book.review.topic')}</span>
                  <span className="truncate">{topicTitle(l.topicKey)}</span>
                </Chip>
              )}
              <WarningNote codes={lw} />
              {le && <span className="basis-full text-sm font-semibold text-bad">{t(le)}</span>}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={btn('ghost', 'justify-self-start')}
        onClick={() => {
          const last = c.lessons[c.lessons.length - 1];
          const n = Number(last?.number);
          onChange({
            lessons: [...c.lessons, newLesson(Number.isInteger(n) && n > 0 ? String(n + 1) : '')],
          });
        }}
      >
        <Icon name="plus" className="sm" />
        {t('ktp.book.review.addLesson')}
      </button>
    </li>
  );
}

/* -------------------------------------------------------- step 3: lessons */

function Nav({ onBack, children }: { onBack: () => void; children: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <button type="button" className={btn('ghost')} onClick={onBack}>
        <Icon name="arrow-left" className="sm" />
        {t('ktp.book.back')}
      </button>
      {children}
    </div>
  );
}

const sameLabel = (a: string, b: string) => classLabel(a).toLocaleLowerCase() === classLabel(b).toLocaleLowerCase();

function LessonsStep({ book, initialClasses, onBack, onDone }: { book: Book; initialClasses?: string[]; onBack: () => void; onDone: (p: TeachingPlan) => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const create = useKtpFromTextbook();
  const classes = useClasses();
  const mine = useMemo(() => classes.data?.pages.flatMap((p) => p.items) ?? [], [classes.data]);
  const ids = useId();
  const nowYear = currentSchoolYear();
  const [hours, setHours] = useState(2);
  const [weeks, setWeeks] = useState(String(SCHOOL_WEEKS));
  const [year, setYear] = useState(nowYear);
  const [extra, setExtra] = useState('');
  const [labels, setLabels] = useState<string[] | null>(initialClasses?.length ? initialClasses : null);
  const [error, setError] = useState<string | null>(null);

  const draft = book.kind === 'own' ? toDraft(book.draft) : null;
  const grade = book.kind === 'catalog' ? book.textbook.grade : book.kind === 'library' ? book.book.grade : draft?.ok ? draft.draft.grade : null;
  const subjectKey =
    book.kind === 'catalog' ? (book.subjectKey ?? textbookSubjects(book.textbook)[0] ?? null) : book.kind === 'library' ? book.book.subjectKey : draft?.ok ? draft.draft.subjectKey : null;
  const name = book.kind === 'catalog' ? tr(book.textbook.shortTitle ?? book.textbook.title, lang) : book.kind === 'library' ? book.book.title : book.draft.title;

  // Prefill (once the classes are known): the teacher's classes of the book's grade and subject.
  const picked = labels ?? mine.filter((c) => c.grade === grade && (!subjectKey || classSubjectKeys(c).includes(subjectKey))).map((c) => classLabel(c.name));
  const options = [...mine.map((c) => classLabel(c.name)), ...picked.filter((p) => !mine.some((c) => sameLabel(c.name, p)))].filter((v, i, a) => a.findIndex((x) => sameLabel(x, v)) === i);
  const toggle = (label: string, on: boolean) => setLabels(on ? [...picked, label] : picked.filter((p) => !sameLabel(p, label)));
  const addExtra = () => {
    const v = classLabel(extra);
    if (!v || picked.length >= MAX_CLASSES) return;
    if (!picked.some((p) => sameLabel(p, v))) setLabels([...picked, v]);
    setExtra('');
  };

  const weeksN = Number(weeks);
  const weeksOk = Number.isInteger(weeksN) && weeksN >= 10 && weeksN <= 40;
  const total = hours * (weeksOk ? weeksN : SCHOOL_WEEKS);

  const submit = () => {
    if (!weeksOk) return setError(t('ktp.book.lessons.weeksError'));
    if (book.kind === 'own' && !draft?.ok) return setError(t('ktp.book.err.validation'));
    setError(null);
    const body: KtpFromTextbookRequest = {
      ...(book.kind === 'catalog'
        ? {
            textbookKey: book.textbook.key,
            ...(book.subjectKey ? { subjectKey: book.subjectKey } : {}),
            lang,
          }
        : book.kind === 'library'
          ? { bookId: book.book.id, lang: book.book.lang }
          : {
              draft: draft!.ok ? draft!.draft : undefined,
              lang: book.draft.lang,
            }),
      hoursPerWeek: hours,
      ...(weeksN !== SCHOOL_WEEKS ? { weeks: weeksN } : {}),
      year,
      ...(picked.length ? { classes: picked.slice(0, MAX_CLASSES) } : {}),
    };
    create.mutate(body, {
      onSuccess: onDone,
      onError: (e) =>
        setError(
          isApiError(e) && e.code === 'rate_limited'
            ? t('ktp.book.err.rateLimited')
            : isApiError(e) && e.code === 'validation_failed'
              ? t('ktp.book.err.validation')
              : `${t('ktp.book.err.createFailed')}: ${t(errorKey(e))}`,
        ),
    });
  };

  return (
    <div className="grid gap-5" data-testid="ktp-book-lessons">
      <p className="m-0 flex items-start gap-2 rounded-lg bg-soft p-3 text-base text-ink">
        <Icon name="book" className="mt-0.5 text-accent" />
        <span className="min-w-0">
          <b>{name}</b>
          {grade ? ` · ${t('teacher.gradeN', { n: grade })}` : ''}
        </span>
      </p>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-semibold text-ink">{t('ktp.book.lessons.hours')}</legend>
        <div className="flex flex-wrap gap-2">
          {HOURS.map((h) => (
            <label key={h} className="cursor-pointer">
              <input type="radio" name={`${ids}-hours`} className="peer visually-hidden" checked={hours === h} onChange={() => setHours(h)} aria-label={t('ktp.book.lessons.hoursN', { count: h })} />
              <span className="inline-flex size-11 items-center justify-center rounded-pill border border-line bg-chip text-base font-semibold text-ink transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-on peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                {h}
              </span>
            </label>
          ))}
        </div>
        <span className="text-sm text-muted">{t('ktp.book.lessons.hoursHint')}</span>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${ids}-weeks`} label={t('ktp.book.lessons.weeks')} hint={t('ktp.book.lessons.weeksHint', { n: SCHOOL_WEEKS })} error={weeksOk ? null : t('ktp.book.lessons.weeksError')}>
          <input
            id={`${ids}-weeks`}
            className={inputCls}
            type="number"
            inputMode="numeric"
            min={10}
            max={40}
            value={weeks}
            aria-invalid={!weeksOk}
            aria-describedby={described(`${ids}-weeks`, true)}
            onChange={(e) => setWeeks(e.target.value)}
          />
        </Field>
        <Field id={`${ids}-year`} label={t('ktp.book.lessons.year')}>
          <select id={`${ids}-year`} className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[nowYear - 1, nowYear, nowYear + 1].map((y) => (
              <option key={y} value={y}>
                {t('ktp.plan.year', { from: y, to: y + 1 })}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="m-0 rounded-lg border border-line bg-chip p-3 text-lg font-semibold text-ink" aria-live="polite" data-testid="ktp-book-total">
        {t('ktp.book.lessons.total', {
          hours,
          weeks: weeksOk ? weeksN : SCHOOL_WEEKS,
          count: total,
        })}
      </p>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-semibold text-ink">{t('ktp.book.lessons.classes')}</legend>
        <span className="text-sm text-muted">{t('ktp.book.lessons.classesHint')}</span>
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((label) => {
              const on = picked.some((p) => sameLabel(p, label));
              return (
                <label
                  key={label}
                  className={cx(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border px-4 text-base font-semibold',
                    on ? 'border-accent bg-soft text-ink' : 'border-line bg-chip text-ink',
                  )}
                >
                  <input type="checkbox" checked={on} disabled={!on && picked.length >= MAX_CLASSES} onChange={(e) => toggle(label, e.target.checked)} />
                  {label}
                </label>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={cx(inputCls, 'w-40')}
            value={extra}
            maxLength={12}
            aria-label={t('ktp.book.lessons.otherClass')}
            placeholder={t('ktp.book.lessons.otherPlaceholder')}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExtra();
              }
            }}
          />
          <button type="button" className={btn('ghost')} disabled={!extra.trim() || picked.length >= MAX_CLASSES} onClick={addExtra}>
            <Icon name="plus" className="sm" />
            {t('ktp.book.lessons.addClass')}
          </button>
        </div>
      </fieldset>

      <p className="m-0 text-sm text-muted">{t('ktp.book.lessons.noDates')}</p>
      <p role="alert" className="m-0 text-base font-semibold text-bad empty:hidden">
        {error ?? ''}
      </p>
      <Nav onBack={onBack}>
        <button type="button" className={btn('primary')} disabled={create.isPending} onClick={submit}>
          <Icon name={create.isPending ? 'sync' : 'check'} className={cx('sm', create.isPending && 'spin')} />
          {t(create.isPending ? 'ktp.book.lessons.creating' : 'ktp.book.lessons.create')}
        </button>
      </Nav>
    </div>
  );
}
