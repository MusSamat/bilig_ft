/**
 * One book (contract 0.9.3): its cover, what the AI read about it (editable
 * meta), the reading's status / progress / cost, «Кайра иштетүү» from a
 * stage, Publish / Archive (content.publish), and the sections grouped by
 * chapter — a row opens an editor of everything the AI wrote about the §.
 * One «Сактоо» sends PATCH /admin/books/:id with the changed meta fields and
 * only the changed sections.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { t as tl, type Lang } from '@bilig/content-model';
import { BOOK_PAGE_IMAGE_BYTES, BOOK_STAGES, type AdminBookPatch, type Book, type BookDetail, type BookSection, type BookStage } from '@bilig/content-model/api';
import { imageToJpeg } from '../../../ktp/bookImage';
import { useApiQuery, useCanCall } from '../../api/hooks';
import { api } from '../../api/session';
import { useAdminLang, useT } from '../../i18n';
import { Icon } from '../../lib/icons';
import { useAdminPath } from '../../shell/base';
import { toast } from '../../shell/toast';
import { Card, Chip, ErrorLine, Field, Loading, Notice, btn, cx, fmtDateTime, iconBtn, inputCls } from '../../staff/ui';
import { BookCover } from './Cover';
import { BookStatusChip, GRADES, LANGS, StageProgress, fmtUsd, useSubjectOptions } from './common';
import { byChapter, changedSections, isBusy } from './model';

type Meta = Pick<Book, 'title' | 'authors' | 'publisher' | 'year' | 'part' | 'summary' | 'subjectKey' | 'grade' | 'lang'>;
const META_KEYS = ['title', 'authors', 'publisher', 'year', 'part', 'summary', 'subjectKey', 'grade', 'lang'] as const;
const metaOf = (b: Book): Meta => Object.fromEntries(META_KEYS.map((k) => [k, b[k]])) as Meta;
const REDO: Exclude<BookStage, 'done'>[] = BOOK_STAGES.filter((s): s is Exclude<BookStage, 'done'> => s !== 'done');

interface Draft {
  meta: Meta;
  sections: BookSection[];
}

export function BookPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const q = useApiQuery('adminBookGet', { params: { id } }, { refetchInterval: (x) => (x.state.data && isBusy(x.state.data.book) ? 5000 : false) });
  const canEdit = useCanCall('adminBookPatch');
  const canPublish = useCanCall('adminBookPublish');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [from, setFrom] = useState<Exclude<BookStage, 'done'>>('sections');

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error || !q.data) return <ErrorLine error={q.error} onRetry={() => void q.refetch()} />;
  const base = q.data;
  const book = base.book;
  const cur: Draft = draft ?? { meta: metaOf(book), sections: base.sections };
  const metaPatch = Object.fromEntries(META_KEYS.filter((k) => JSON.stringify(cur.meta[k]) !== JSON.stringify(book[k])).map((k) => [k, cur.meta[k]])) as Partial<Meta>;
  const sectionPatch = changedSections(base.sections, cur.sections);
  const dirty = Object.keys(metaPatch).length + sectionPatch.length;

  const setMeta = (p: Partial<Meta>) => setDraft({ ...cur, meta: { ...cur.meta, ...p } });
  const setSection = (sid: string, p: Partial<BookSection>) => setDraft({ ...cur, sections: cur.sections.map((s) => (s.id === sid ? { ...s, ...p } : s)) });
  const store = (d: BookDetail) => {
    qc.setQueryData(['adminBookGet', { id }, {}], d);
    void qc.invalidateQueries({ queryKey: ['adminBookList'] });
  };

  const act = async (key: string, fn: () => Promise<unknown>, okKey?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (okKey) toast(okKey);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    act(
      'save',
      async () => {
        const body: AdminBookPatch = { ...metaPatch, ...(sectionPatch.length ? { sections: sectionPatch } : {}) };
        store(await api.call('adminBookPatch', { params: { id }, body }));
        setDraft(null);
      },
      'books.saved',
    );
  const withBook = (b: Book) => store({ ...base, book: b });

  return (
    <div className="grid gap-5 pb-24">
      <div className="flex flex-wrap items-start gap-4">
        <Link to={to('books')} className={btn('ghost', 'px-3')}>
          <Icon id="prev" size={18} />
          {t('books.back')}
        </Link>
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="m-0 text-ink">{book.title}</h1>
          <span className="flex flex-wrap items-center gap-2 text-base text-muted">
            <BookStatusChip status={book.status} />
            {t('books.gradeN', { n: book.grade })} · {book.lang.toUpperCase()} · {book.fileName}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPublish && (book.status === 'review' || book.status === 'archived') && (
            <button type="button" className={btn('primary')} disabled={!!busy || dirty > 0} title={dirty ? t('books.saveFirst') : undefined} onClick={() => void act('publish', async () => withBook(await api.call('adminBookPublish', { params: { id } })), 'books.publishedToast')}>
              <Icon id="a-publish" size={18} />
              {t('books.publish')}
            </button>
          )}
          {canPublish && book.status !== 'archived' && book.status !== 'uploading' && (
            <button type="button" className={btn('danger')} disabled={!!busy} onClick={() => void act('archive', async () => withBook(await api.call('adminBookArchive', { params: { id } })), 'books.archivedToast')}>
              <Icon id="trash" size={18} />
              {t('books.archive')}
            </button>
          )}
        </div>
      </div>
      <ErrorLine error={error} />

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <CoverBlock book={book} canEdit={canEdit} onBook={withBook} />
        <Card title={t('books.statusTitle')} titleId="book-status" className="grid content-start gap-4">
          <StageProgress book={book} />
          {book.error && <Notice tone="warn">{book.error}</Notice>}
          <dl className="m-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat k={t('books.col.cost')} v={fmtUsd(book.usage.costUsd, lang)} />
            <Stat k={t('books.tokens')} v={t('books.tokensValue', { input: book.usage.inputTokens.toLocaleString(), cached: book.usage.cachedInputTokens.toLocaleString(), output: book.usage.outputTokens.toLocaleString() })} />
            <Stat k={t('books.pages')} v={`${book.pagesUploaded} / ${book.pageCount}`} />
            <Stat k={t('books.col.updated')} v={fmtDateTime(book.updatedAt, lang)} />
          </dl>
          {canEdit && book.status !== 'uploading' && !isBusy(book) && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                {t('books.reprocessFrom')}
                <select className={cx(inputCls, 'w-56')} value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
                  {REDO.map((s) => (
                    <option key={s} value={s}>
                      {t(`books.stage.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={btn('secondary')} disabled={!!busy} onClick={() => void act('process', async () => withBook(await api.call('adminBookProcess', { params: { id }, body: { from } })), 'books.reprocessToast')}>
                <Icon id="reset" size={18} />
                {t('books.reprocess')}
              </button>
            </div>
          )}
        </Card>
      </div>

      <MetaForm meta={cur.meta} onChange={setMeta} readOnly={!canEdit} />

      <Card title={t('books.sections.title', { count: cur.sections.length })} titleId="book-sections" className="grid gap-4">
        {cur.sections.length === 0 ? (
          <p className="m-0 text-base text-muted">{isBusy(book) ? t('books.sections.reading') : t('books.sections.none')}</p>
        ) : (
          byChapter(cur.sections).map((ch) => (
            <section key={ch.key} className="grid gap-2" aria-labelledby={`ch-${ch.items[0].id}`}>
              <h3 id={`ch-${ch.items[0].id}`} className="m-0 text-md font-semibold text-ink">
                {[ch.number, ch.title].filter(Boolean).join('. ')}
              </h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {ch.items.map((s) => (
                  <SectionRow key={s.id} s={s} subjectKey={cur.meta.subjectKey} readOnly={!canEdit} onChange={(p) => setSection(s.id, p)} />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>

      {canEdit && dirty > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-g3 px-5 py-3 shadow-panel" role="region" aria-label={t('books.unsaved', { count: dirty })}>
          <span className="flex-1 text-base text-ink">{t('books.unsaved', { count: dirty })}</span>
          <button type="button" className={btn('ghost')} onClick={() => setDraft(null)} disabled={busy === 'save'}>
            {t('books.discard')}
          </button>
          <button type="button" className={btn('primary')} onClick={() => void save()} disabled={busy === 'save'}>
            <Icon id="check" size={18} />
            {t('books.save')}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="m-0 text-base font-semibold text-ink">{v}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------- cover */

function CoverBlock({ book, canEdit, onBook }: { book: Book; canEdit: boolean; onBook(b: Book): void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) return setError(t('books.cover.type'));
    setBusy(true);
    setError(null);
    try {
      const image = await imageToJpeg(file, 1600, BOOK_PAGE_IMAGE_BYTES);
      onBook(await api.call('adminBookCover', { params: { id: book.id }, body: { image } }));
      toast('books.cover.uploaded');
    } catch {
      setError(t('books.cover.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('books.cover.title')} titleId="book-cover" className="grid content-start gap-3">
      <BookCover book={book} className="max-w-64" />
      {!book.coverUrl && <p className="m-0 text-sm text-muted">{t('books.cover.none')}</p>}
      {canEdit && (
        <label className={cx(btn('secondary'), 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent', busy && 'opacity-50')}>
          <Icon id={busy ? 'reset' : 'upload'} size={18} />
          {t('books.cover.upload')}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            aria-label={t('books.cover.upload')}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}
      <p role="alert" className="m-0 text-sm font-semibold text-bad empty:hidden">
        {error ?? ''}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------- meta */

function MetaForm({ meta, onChange, readOnly }: { meta: Meta; onChange(p: Partial<Meta>): void; readOnly: boolean }) {
  const t = useT();
  const ids = useId();
  const subjects = useSubjectOptions();
  const f = (k: string) => `${ids}-${k}`;
  return (
    <Card title={t('books.meta')} titleId="book-meta" className="grid gap-4">
      <fieldset disabled={readOnly} className="m-0 grid gap-4 border-0 p-0 md:grid-cols-6">
        <Field id={f('title')} label={t('books.field.title')} className="md:col-span-4">
          <input id={f('title')} className={inputCls} value={meta.title} maxLength={300} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field id={f('part')} label={t('books.field.part')}>
          <select id={f('part')} className={inputCls} value={meta.part ?? ''} onChange={(e) => onChange({ part: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field id={f('year')} label={t('books.field.year')}>
          <input id={f('year')} className={inputCls} inputMode="numeric" value={meta.year ?? ''} onChange={(e) => onChange({ year: /^\d{4}$/.test(e.target.value) ? Number(e.target.value) : null })} />
        </Field>
        <Field id={f('authors')} label={t('books.field.authors')} hint={t('books.field.authorsHint')} className="md:col-span-3">
          <textarea id={f('authors')} rows={2} className={cx(inputCls, 'min-h-20 py-2')} value={meta.authors.join('\n')} onChange={(e) => onChange({ authors: e.target.value.split('\n').map((a) => a.trim()).filter(Boolean).slice(0, 20) })} />
        </Field>
        <Field id={f('publisher')} label={t('books.field.publisher')} className="md:col-span-3">
          <input id={f('publisher')} className={inputCls} value={meta.publisher} maxLength={200} onChange={(e) => onChange({ publisher: e.target.value })} />
        </Field>
        <Field id={f('subject')} label={t('books.field.subject')} className="md:col-span-2">
          {subjects.length ? (
            <select id={f('subject')} className={inputCls} value={meta.subjectKey} onChange={(e) => onChange({ subjectKey: e.target.value })}>
              {!subjects.some((s) => s.value === meta.subjectKey) && <option value={meta.subjectKey}>{meta.subjectKey}</option>}
              {subjects.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <input id={f('subject')} className={inputCls} value={meta.subjectKey} onChange={(e) => onChange({ subjectKey: e.target.value.trim() })} />
          )}
        </Field>
        <Field id={f('grade')} label={t('books.field.grade')} className="md:col-span-2">
          <select id={f('grade')} className={inputCls} value={meta.grade} onChange={(e) => onChange({ grade: Number(e.target.value) })}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {t('books.gradeN', { n: g })}
              </option>
            ))}
          </select>
        </Field>
        <Field id={f('lang')} label={t('books.field.lang')} className="md:col-span-2">
          <select id={f('lang')} className={inputCls} value={meta.lang} onChange={(e) => onChange({ lang: e.target.value as Lang })}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`enum.${l}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={f('summary')} label={t('books.field.summary')} className="md:col-span-6">
          <textarea id={f('summary')} rows={4} className={cx(inputCls, 'min-h-28 py-2')} value={meta.summary} maxLength={3000} onChange={(e) => onChange({ summary: e.target.value })} />
        </Field>
      </fieldset>
    </Card>
  );
}

/* ---------------------------------------------------------------- sections */

function SectionRow({ s, subjectKey, readOnly, onChange }: { s: BookSection; subjectKey: string; readOnly: boolean; onChange(p: Partial<BookSection>): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const name = s.number ? `§ ${s.number}. ${s.title}` : s.title;
  const panel = `sec-${s.id}`;
  return (
    <li className={cx('grid gap-3 rounded-lg border bg-chip p-3', open ? 'border-accent' : 'border-line')} data-testid="book-section">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={iconBtn()} aria-expanded={open} aria-controls={panel} aria-label={t(open ? 'books.sections.collapse' : 'books.sections.expand', { name })} onClick={() => setOpen(!open)}>
          <Icon id={open ? 'up' : 'down'} size={18} />
        </button>
        <span className="w-12 flex-none font-semibold text-muted">{s.number ? `§ ${s.number}` : '—'}</span>
        <span className="min-w-0 flex-1 basis-56 text-base font-semibold text-ink">{s.title}</span>
        <span className="text-sm text-muted">{s.pages ? t('books.sections.pages', { from: s.pages.from, to: s.pages.to }) : '—'}</span>
        <Chip>{t(`books.kind.${s.kind}`)}</Chip>
        {s.topicKey ? (
          <Chip tone="ok">
            <Icon id="cube" size={14} />
            {s.topicKey}
          </Chip>
        ) : (
          <Chip>{t('books.sections.noTopic')}</Chip>
        )}
        {!s.reviewed && (
          <Chip tone="warn" className="uppercase">
            <Icon id="wand" size={14} />
            {t('books.sections.ai')}
          </Chip>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" checked={s.reviewed} disabled={readOnly} onChange={(e) => onChange({ reviewed: e.target.checked })} aria-label={t('books.sections.reviewedOf', { name })} />
          {t('books.sections.reviewed')}
        </label>
      </div>
      {open && (
        <div id={panel} className="grid gap-4 border-t border-line pt-3">
          <SectionEditor s={s} subjectKey={subjectKey} readOnly={readOnly} onChange={onChange} />
        </div>
      )}
    </li>
  );
}

function SectionEditor({ s, subjectKey, readOnly, onChange }: { s: BookSection; subjectKey: string; readOnly: boolean; onChange(p: Partial<BookSection>): void }) {
  const t = useT();
  const ids = useId();
  return (
    <fieldset disabled={readOnly} className="m-0 grid gap-4 border-0 p-0">
      <Field id={`${ids}-title`} label={t('books.sec.title')}>
        <input id={`${ids}-title`} className={inputCls} value={s.title} maxLength={500} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field id={`${ids}-summary`} label={t('books.sec.summary')}>
        <textarea id={`${ids}-summary`} rows={3} className={cx(inputCls, 'min-h-24 py-2')} value={s.summary} maxLength={2000} onChange={(e) => onChange({ summary: e.target.value })} />
      </Field>
      <StringList label={t('books.sec.objectives')} items={s.objectives} max={10} onChange={(objectives) => onChange({ objectives })} />
      <Rows
        label={t('books.sec.keyTerms')}
        items={s.keyTerms}
        max={30}
        blank={{ term: '', definition: '' }}
        cols={[
          { k: 'term', label: t('books.sec.term'), w: 'md:w-56' },
          { k: 'definition', label: t('books.sec.definition') },
        ]}
        onChange={(keyTerms) => onChange({ keyTerms })}
      />
      <Rows
        label={t('books.sec.formulas')}
        items={s.formulas}
        max={20}
        blank={{ formula: '', meaning: '' }}
        cols={[
          { k: 'formula', label: t('books.sec.formula'), w: 'md:w-56 font-mono' },
          { k: 'meaning', label: t('books.sec.meaning') },
        ]}
        onChange={(formulas) => onChange({ formulas })}
      />
      <Rows
        label={t('books.sec.quantities')}
        items={s.quantities}
        max={20}
        blank={{ name: '', symbol: '', unit: '' }}
        cols={[
          { k: 'name', label: t('books.sec.qname') },
          { k: 'symbol', label: t('books.sec.symbol'), w: 'md:w-28 font-mono' },
          { k: 'unit', label: t('books.sec.unit'), w: 'md:w-28' },
        ]}
        onChange={(quantities) => onChange({ quantities })}
      />
      <StringList label={t('books.sec.facts')} items={s.facts} max={15} onChange={(facts) => onChange({ facts })} />
      <StringList label={t('books.sec.experiments')} items={s.experiments} max={10} onChange={(experiments) => onChange({ experiments })} />
      <StringList label={t('books.sec.questions')} items={s.questions} max={30} onChange={(questions) => onChange({ questions })} />
      <Keywords items={s.keywords} onChange={(keywords) => onChange({ keywords })} />
      <TopicKeyPicker value={s.topicKey} subjectKey={subjectKey} onChange={(topicKey) => onChange({ topicKey })} />
    </fieldset>
  );
}

function StringList({ label, items, max, onChange }: { label: string; items: string[]; max: number; onChange(v: string[]): void }) {
  const t = useT();
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold text-ink">{label}</legend>
      {items.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <textarea rows={1} className={cx(inputCls, 'min-h-11 py-2')} value={v} aria-label={`${label} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className={iconBtn()} aria-label={t('books.sec.remove', { what: `${label} ${i + 1}` })} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Icon id="x" size={18} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className={btn('ghost', 'justify-self-start')} onClick={() => onChange([...items, ''])}>
          <Icon id="plus" size={16} />
          {t('books.sec.add', { what: label })}
        </button>
      )}
    </fieldset>
  );
}

function Rows<T extends Record<string, string>>({ label, items, max, blank, cols, onChange }: { label: string; items: T[]; max: number; blank: T; cols: { k: keyof T & string; label: string; w?: string }[]; onChange(v: T[]): void }) {
  const t = useT();
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold text-ink">{label}</legend>
      {items.map((row, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2 md:flex-nowrap">
          {cols.map((c) => (
            <input key={c.k} className={cx(inputCls, c.w ?? 'min-w-0 flex-1')} value={row[c.k]} aria-label={`${c.label} ${i + 1}`} placeholder={c.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [c.k]: e.target.value } : x)))} />
          ))}
          <button type="button" className={iconBtn()} aria-label={t('books.sec.remove', { what: `${label} ${i + 1}` })} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Icon id="x" size={18} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className={btn('ghost', 'justify-self-start')} onClick={() => onChange([...items, { ...blank }])}>
          <Icon id="plus" size={16} />
          {t('books.sec.add', { what: label })}
        </button>
      )}
    </fieldset>
  );
}

function Keywords({ items, onChange }: { items: string[]; onChange(v: string[]): void }) {
  const t = useT();
  const id = useId();
  const [v, setV] = useState('');
  const add = () => {
    const w = v.trim();
    if (w && !items.includes(w) && items.length < 30) onChange([...items, w.slice(0, 80)]);
    setV('');
  };
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {t('books.sec.keywords')}
      </label>
      <div className="flex flex-wrap gap-2">
        {items.map((k) => (
          <span key={k} className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-line bg-panel ps-3 text-sm font-semibold text-ink">
            {k}
            <button type="button" className="inline-flex size-9 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent text-muted hover:text-ink" aria-label={t('books.sec.remove', { what: k })} onClick={() => onChange(items.filter((x) => x !== k))}>
              <Icon id="x" size={14} />
            </button>
          </span>
        ))}
      </div>
      <input
        id={id}
        className={cx(inputCls, 'max-w-80')}
        value={v}
        placeholder={t('books.sec.keywordHint')}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/** The Bilig topic of a §: search the topics (admin list, server `q`), or clear it. */
function TopicKeyPicker({ value, subjectKey, onChange }: { value: string | null; subjectKey: string; onChange(v: string | null): void }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const id = useId();
  const [q, setQ] = useState(value ?? '');
  useEffect(() => setQ(value ?? ''), [value]);
  const search = q.trim();
  const topics = useApiQuery('adminTopicList', { query: { q: search, subjectKey, limit: 20 } }, { enabled: search.length >= 2 && search !== value, staleTime: 30_000, retry: false });
  const hits = topics.data?.items ?? [];
  const pick = (k: string | null) => {
    onChange(k);
    setQ(k ?? '');
  };
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {t('books.sec.topic')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          className={cx(inputCls, 'max-w-96 font-mono')}
          value={q}
          list={`${id}-list`}
          placeholder={t('books.sec.topicHint')}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => {
            const k = q.trim();
            if (k !== (value ?? '')) pick(/^[a-z0-9][a-z0-9.-]*$/.test(k) ? k : value);
          }}
        />
        <datalist id={`${id}-list`}>
          {hits.map((h) => (
            <option key={h.key} value={h.key}>
              {h.title ? tl(h.title, lang as Lang) : h.key}
            </option>
          ))}
        </datalist>
        {value && (
          <button type="button" className={btn('ghost')} onClick={() => pick(null)}>
            <Icon id="x" size={16} />
            {t('books.sec.topicClear')}
          </button>
        )}
      </div>
    </div>
  );
}
