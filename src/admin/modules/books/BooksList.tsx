/**
 * «Китептер / Учебники» (contract 0.9.3): every school book staff uploaded.
 * Filters (grade / subject / language / status) live in the URL; the books
 * show as a shelf of covers or as a table, and refresh every 5 s while one is
 * queued or being read. «Китеп жүктөө» queues several PDFs at once (same grade
 * and language, a subject per file): each one is created, its pages rendered
 * in the browser and sent in batches, then the reading starts.
 */
import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Lang } from '@bilig/content-model';
import type { Book, BookStatus } from '@bilig/content-model/api';
import { BOOK_STATUSES } from '@bilig/content-model/api';
import { useApiQuery, useCanCall } from '../../api/hooks';
import { useAdminLang, useT } from '../../i18n';
import { Icon } from '../../lib/icons';
import { useAdminPath } from '../../shell/base';
import { Card, Empty, ErrorLine, Field, Loading, PageTitle, Sheet, Td, btn, cx, fmtDateTime, inputCls, tableCls, tbodyCls, thCls, theadCls, trCls } from '../../staff/ui';
import { BookCover } from './Cover';
import { BookStatusChip, GRADES, LANGS, StageProgress, fmtUsd, useSubjectOptions } from './common';
import { isBusy } from './model';
import { uploadDeps, useUploads, type UploadJob } from './uploadQueue';

const FILTERS = ['grade', 'subjectKey', 'lang', 'status'] as const;

export function BooksList() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'table' ? 'table' : 'grid';
  const canCreate = useCanCall('adminBookCreate');
  const subjects = useSubjectOptions();
  const subjectTitle = (k: string) => subjects.find((s) => s.value === k)?.label ?? k;
  const [uploading, setUploading] = useState(false);
  const jobs = useUploads((s) => s.jobs);

  const query = {
    ...(sp.get('grade') ? { grade: Number(sp.get('grade')) } : {}),
    ...(sp.get('subjectKey') ? { subjectKey: sp.get('subjectKey')! } : {}),
    ...(sp.get('lang') ? { lang: sp.get('lang') as Lang } : {}),
    ...(sp.get('status') ? { status: sp.get('status') as BookStatus } : {}),
  };
  const list = useApiQuery('adminBookList', { query }, { refetchInterval: (q) => (q.state.data?.items.some(isBusy) ? 5000 : false) });

  // A book the queue created or started shows up in the list at once.
  useEffect(() => {
    uploadDeps.onBook = () => void qc.invalidateQueries({ queryKey: ['adminBookList'] });
    return () => {
      uploadDeps.onBook = () => {};
    };
  }, [qc]);

  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const items = list.data?.items ?? [];
  const filtered = FILTERS.some((f) => sp.get(f));

  return (
    <div className="grid gap-5">
      <PageTitle
        title={t('nav.books')}
        description={t('books.lead')}
        icon="book"
        action={
          canCreate && (
            <button type="button" className={btn('primary')} onClick={() => setUploading(true)}>
              <Icon id="upload" size={18} />
              {t('books.upload.open')}
            </button>
          )
        }
      />
      {jobs.length > 0 && <UploadQueue />}
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          {t('books.field.grade')}
          <select className={cx(inputCls, 'w-36')} value={sp.get('grade') ?? ''} onChange={(e) => set('grade', e.target.value)}>
            <option value="">{t('books.filter.any')}</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {t('books.gradeN', { n: g })}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          {t('books.field.subject')}
          <select className={cx(inputCls, 'w-48')} value={sp.get('subjectKey') ?? ''} onChange={(e) => set('subjectKey', e.target.value)}>
            <option value="">{t('books.filter.any')}</option>
            {subjects.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          {t('books.field.lang')}
          <select className={cx(inputCls, 'w-36')} value={sp.get('lang') ?? ''} onChange={(e) => set('lang', e.target.value)}>
            <option value="">{t('books.filter.any')}</option>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`enum.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink">
          {t('books.field.status')}
          <select className={cx(inputCls, 'w-44')} value={sp.get('status') ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">{t('books.filter.any')}</option>
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`books.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <div className="inline-flex rounded-pill border border-line bg-chip p-1" role="group" aria-label={t('books.view.label')}>
          {(['grid', 'table'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} className={cx('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-pill border-0 px-4 text-sm font-semibold', view === v ? 'bg-accent text-on' : 'bg-transparent text-ink')} onClick={() => set('view', v === 'grid' ? '' : v)}>
              <Icon id={v === 'grid' ? 'grid' : 'columns'} size={16} />
              {t(`books.view.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <Loading rows={4} />
      ) : list.error ? (
        <ErrorLine error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon="book" title={filtered ? t('books.emptyFiltered') : t('books.empty')} text={filtered ? undefined : t('books.emptyHint')} />
      ) : view === 'grid' ? (
        <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label={t('nav.books')}>
          {items.map((b) => (
            <li key={b.id} className="min-w-0">
              <Link to={to(`books/${b.id}`)} className="grid h-full content-start gap-2 rounded-lg border border-edge bg-panel p-3 text-ink no-underline shadow-panel transition-colors hover:border-accent" data-testid="book-card">
                <BookCover book={b} />
                <b className="line-clamp-2 text-base">{b.title}</b>
                <span className="text-sm text-muted">{[t('books.gradeN', { n: b.grade }), subjectTitle(b.subjectKey), b.lang.toUpperCase(), b.part ? t('books.partN', { n: b.part }) : null].filter(Boolean).join(' · ')}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <BookStatusChip status={b.status} />
                  {b.sectionCount > 0 && <span className="text-sm text-muted">{t('books.sectionsN', { count: b.sectionCount })}</span>}
                </span>
                {(isBusy(b) || b.status === 'uploading' || b.status === 'failed') && <StageProgress book={b} />}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <BooksTable items={items} subjectTitle={subjectTitle} lang={lang} />
      )}
      {uploading && <UploadSheet onClose={() => setUploading(false)} />}
    </div>
  );
}

function BooksTable({ items, subjectTitle, lang }: { items: Book[]; subjectTitle: (k: string) => string; lang: string }) {
  const t = useT();
  const to = useAdminPath();
  const cols = ['title', 'grade', 'subject', 'lang', 'status', 'stage', 'sections', 'cost', 'updated'] as const;
  return (
    <table className={tableCls}>
      <caption className="sr-only">{t('nav.books')}</caption>
      <thead className={theadCls}>
        <tr>
          {cols.map((c) => (
            <th key={c} className={thCls}>
              {t(`books.col.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={tbodyCls}>
        {items.map((b) => (
          <tr key={b.id} className={trCls}>
            <Td label={t('books.col.title')}>
              <Link className="inline-flex min-h-11 items-center font-semibold text-accent" to={to(`books/${b.id}`)}>
                {b.title}
              </Link>
            </Td>
            <Td label={t('books.col.grade')}>{b.grade}</Td>
            <Td label={t('books.col.subject')}>{subjectTitle(b.subjectKey)}</Td>
            <Td label={t('books.col.lang')}>{b.lang.toUpperCase()}</Td>
            <Td label={t('books.col.status')}>
              <BookStatusChip status={b.status} />
            </Td>
            <Td label={t('books.col.stage')}>
              <StageProgress book={b} compact />
            </Td>
            <Td label={t('books.col.sections')}>{b.sectionCount}</Td>
            <Td label={t('books.col.cost')}>{fmtUsd(b.usage.costUsd, lang)}</Td>
            <Td label={t('books.col.updated')}>{fmtDateTime(b.updatedAt, lang)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ upload */

interface FilePick {
  file: File;
  subjectKey: string;
  title: string;
  part: string;
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

function UploadSheet({ onClose }: { onClose(): void }) {
  const t = useT();
  const ids = useId();
  const subjects = useSubjectOptions();
  const add = useUploads((s) => s.add);
  const [grade, setGrade] = useState('');
  const [lang, setLang] = useState<Lang>('ky');
  const [subject, setSubject] = useState('');
  const [picks, setPicks] = useState<FilePick[]>([]);
  const [error, setError] = useState<string | null>(null);

  const choose = (list: FileList | null) => {
    const files = [...(list ?? [])];
    const bad = files.filter((f) => !isPdf(f));
    setError(bad.length ? t('books.upload.notPdf', { names: bad.map((f) => f.name).join(', ') }) : null);
    setPicks((p) => [...p, ...files.filter(isPdf).map((file) => ({ file, subjectKey: subject, title: '', part: '' }))]);
  };
  const setPick = (i: number, patch: Partial<FilePick>) => setPicks((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = () => {
    if (!picks.length) return setError(t('books.upload.noFiles'));
    if (!grade) return setError(t('books.upload.noGrade'));
    if (picks.some((p) => !p.subjectKey)) return setError(t('books.upload.noSubject'));
    add(
      picks.map((p) => ({
        file: p.file,
        meta: { grade: Number(grade), lang, subjectKey: p.subjectKey, ...(p.title.trim() ? { title: p.title.trim() } : {}), ...(p.part ? { part: Number(p.part) } : {}) },
      })),
    );
    onClose();
  };

  return (
    <Sheet
      title={t('books.upload.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={btn('ghost')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={btn('primary')} onClick={submit}>
            <Icon id="upload" size={18} />
            {t('books.upload.start', { count: picks.length })}
          </button>
        </>
      }
    >
      <p className="m-0 text-base text-muted">{t('books.upload.lead')}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field id={`${ids}-grade`} label={t('books.field.grade')}>
          <select id={`${ids}-grade`} className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">{t('books.upload.choose')}</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {t('books.gradeN', { n: g })}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${ids}-lang`} label={t('books.field.lang')}>
          <select id={`${ids}-lang`} className={inputCls} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`enum.${l}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${ids}-subject`} label={t('books.upload.defaultSubject')}>
          <SubjectSelect
            id={`${ids}-subject`}
            value={subject}
            options={subjects}
            onChange={(v) => {
              setSubject(v);
              setPicks((p) => p.map((x) => (x.subjectKey ? x : { ...x, subjectKey: v })));
            }}
          />
        </Field>
      </div>
      <div className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center">
        <label className={cx(btn('secondary'), 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent')}>
          <Icon id="file" size={18} />
          {t('books.upload.files')}
          <input
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,application/pdf"
            aria-label={t('books.upload.files')}
            onChange={(e) => {
              choose(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-sm text-muted">{t('books.upload.filesHint')}</span>
      </div>
      {picks.length > 0 && (
        <ul className="m-0 grid list-none gap-3 p-0" aria-label={t('books.upload.picked')}>
          {picks.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="grid gap-2 rounded-lg border border-line bg-chip p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_5rem_auto] md:items-end">
              <span className="flex min-h-11 min-w-0 items-center gap-2 font-semibold text-ink">
                <Icon id="file" size={18} />
                <span className="truncate">{p.file.name}</span>
              </span>
              <SubjectSelect value={p.subjectKey} options={subjects} label={t('books.upload.subjectOf', { name: p.file.name })} onChange={(v) => setPick(i, { subjectKey: v })} />
              <input className={inputCls} value={p.title} maxLength={300} placeholder={t('books.upload.titleOpt')} aria-label={t('books.upload.titleOf', { name: p.file.name })} onChange={(e) => setPick(i, { title: e.target.value })} />
              <select className={inputCls} value={p.part} aria-label={t('books.upload.partOf', { name: p.file.name })} onChange={(e) => setPick(i, { part: e.target.value })}>
                <option value="">{t('books.upload.noPart')}</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button type="button" className={btn('ghost', 'px-3')} aria-label={t('books.upload.removeFile', { name: p.file.name })} onClick={() => setPicks((x) => x.filter((_, j) => j !== i))}>
                <Icon id="x" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="alert" className="m-0 text-base font-semibold text-bad empty:hidden">
        {error ?? ''}
      </p>
    </Sheet>
  );
}

function SubjectSelect({ id, value, options, onChange, label }: { id?: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void; label?: string }) {
  const t = useT();
  // Without the subject dictionary (no access, not loaded) the key is typed in.
  if (!options.length) return <input id={id} className={inputCls} value={value} aria-label={label} placeholder="phys" onChange={(e) => onChange(e.target.value.trim())} />;
  return (
    <select id={id} className={inputCls} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('books.upload.choose')}</option>
      {options.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

const JOB_TONE: Record<UploadJob['state'], string> = { waiting: 'text-muted', opening: 'text-ink', uploading: 'text-ink', starting: 'text-ink', done: 'text-ok', failed: 'text-bad' };

function UploadQueue() {
  const t = useT();
  const to = useAdminPath();
  const { jobs, retry, remove, clearDone } = useUploads();
  return (
    <Card title={t('books.queue.title')} titleId="books-queue" className="grid gap-3">
      <ul className="m-0 grid list-none gap-3 p-0" aria-labelledby="books-queue">
        {jobs.map((j) => {
          const label = t('books.queue.pages', { sent: j.sent, total: j.total || '…' });
          return (
            <li key={j.key} className="grid gap-2 rounded-lg border border-line bg-chip p-3" data-testid="upload-job">
              <div className="flex flex-wrap items-center gap-3">
                <Icon id="file" size={18} />
                <b className="min-w-0 flex-1 truncate text-base text-ink">{j.file.name}</b>
                <span className={cx('text-sm font-semibold', JOB_TONE[j.state])}>{t(`books.queue.state.${j.state}`)}</span>
                {j.bookId && (
                  <Link className="text-sm font-semibold text-accent" to={to(`books/${j.bookId}`)}>
                    {t('books.queue.open')}
                  </Link>
                )}
                {j.state === 'failed' && (
                  <button type="button" className={btn('secondary', 'min-h-9 px-4')} onClick={() => retry(j.key)}>
                    <Icon id="reset" size={16} />
                    {t('books.queue.retry')}
                  </button>
                )}
                {(j.state === 'waiting' || j.state === 'failed' || j.state === 'done') && (
                  <button type="button" className={btn('ghost', 'min-h-9 px-3')} aria-label={t('books.queue.remove', { name: j.file.name })} onClick={() => remove(j.key)}>
                    <Icon id="x" size={16} />
                  </button>
                )}
              </div>
              {j.total > 0 && (
                <span className="grid gap-1">
                  <span className="text-sm text-muted">{label}</span>
                  <span className="block h-2 overflow-hidden rounded-pill bg-soft" role="progressbar" aria-label={t('books.queue.progress', { name: j.file.name })} aria-valuemin={0} aria-valuemax={j.total} aria-valuenow={j.sent} aria-valuetext={label}>
                    <span className={cx('block h-full rounded-pill', j.state === 'failed' ? 'bg-bad' : 'bg-accent')} style={{ width: `${Math.round((j.sent / j.total) * 100)}%` }} />
                  </span>
                </span>
              )}
              {j.state === 'failed' && (
                <p className="m-0 text-sm font-semibold text-bad" role="alert">
                  {j.failedPage ? t('books.queue.failedAt', { page: j.failedPage, reason: t(`books.queue.err.${j.error}`) }) : t(`books.queue.err.${j.error ?? 'send'}`)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {jobs.some((j) => j.state === 'done') && (
        <button type="button" className={btn('ghost', 'justify-self-start')} onClick={clearDone}>
          {t('books.queue.clearDone')}
        </button>
      )}
      <p className="m-0 text-sm text-muted">{t('books.queue.hint')}</p>
    </Card>
  );
}
