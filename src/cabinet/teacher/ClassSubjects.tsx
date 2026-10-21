/**
 * A class's subjects (contract 0.8.0 §6.3, GET /classes/:id/subjects): a card
 * per subject with its КТП status — «no КТП yet» with an upload that already
 * knows the class and subject, or «КТП ready» with the problem count — the
 * next lesson (date in the UI language, title, linked topic, «План (.docx)»)
 * and the progress «24 / 138 lessons». Subjects are added and removed here
 * (PATCH /classes/:id { subjectKeys }); a class keeps at least one.
 */
import { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import type { Book, ClassSubject, SchoolClass, TeachingPlan } from '@bilig/content-model/api';
import { subjectSwatch } from '@bilig/scene-core';
import { api } from '../../api/client';
import { useCatalog } from '../../api/content';
import { usePermission } from '../../api/session';
import { Icon } from '../../components/Icon';
import { fetchLessonPlan, ktpKeys, useDownloads } from '../../ktp/api';
import { addDays, classLabel, parseIso, todayIso } from '../../ktp/model';
import { ProblemCount } from '../../ktp/Problems';
import { fmtDate } from '../../lib/format';
import { useLang } from '../../lib/hooks';
import { topicPath } from '../../lib/urls';
import { toast, useUi } from '../../state/ui';
import { errorKey } from '../format';
import { ClassBookLine, useClassBook } from './ClassBook';
import { classSubjectKeys } from './ClassesSection';
import { SubjectToggles } from './ClassForm';
import { useSubjectTitle } from './TeachingPicker';
import { Chip, ErrorState, Sheet, Skeleton, btn, cardCls, cx, iconBtn } from './ui';

const KtpUploadSheet = lazy(() => import('../../ktp/UploadSheet'));
const FromTextbookSheet = lazy(() => import('../../ktp/FromTextbookSheet'));

export const classSubjectsKey = (id: string) => ['classes', 'subjects', id] as const;

export function ClassSubjects({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const subjects = useQuery({ queryKey: classSubjectsKey(cls.id), queryFn: () => api('classSubjects', { params: { id: cls.id } }) });
  const [adding, setAdding] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  // v0.9.3: «КТП from the class's book», straight to the number of lessons.
  const [fromBook, setFromBook] = useState<Book | null>(null);
  const keys = classSubjectKeys(cls);
  const items = subjects.data?.items ?? [];
  // One primary action per view: the upload of the first subject still without a КТП.
  const firstMissing = items.find((s) => s.ktp.status === 'none')?.subjectKey;

  const setKeys = async (next: string[]) => {
    const saved = await api('classPatch', { params: { id: cls.id }, body: { subjectKeys: next } });
    onChange(saved);
    await qc.invalidateQueries({ queryKey: ['classes'] });
    return saved;
  };

  return (
    <section className="grid gap-4" aria-labelledby="subjects-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="subjects-title" className="font-serif text-xl font-bold text-ink">
          {t('teacherHome.subjects.title')}
        </h2>
        <button type="button" className={btn('secondary')} onClick={() => setAdding(true)}>
          <Icon name="plus" className="sm" />
          {t('teacherHome.subjects.add')}
        </button>
      </div>
      {subjects.isLoading && (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}
      {subjects.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void subjects.refetch()} />}
      {subjects.isSuccess && items.length === 0 && <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-base text-muted">{t('teacherHome.subjects.empty')}</p>}
      {items.length > 0 && (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2" aria-labelledby="subjects-title">
          {items.map((s) => (
            <SubjectCard
              key={s.subjectKey}
              cls={cls}
              item={s}
              primary={s.subjectKey === firstMissing}
              canRemove={keys.length > 1}
              onUpload={() => setUploadFor(s.subjectKey)}
              onFromBook={setFromBook}
              onClass={onChange}
              onRemove={() => setKeys(keys.filter((k) => k !== s.subjectKey))}
            />
          ))}
        </ul>
      )}
      {adding && <AddSubjectsSheet current={keys} onClose={() => setAdding(false)} onSave={(added) => setKeys([...keys, ...added]).then(() => setAdding(false))} />}
      {fromBook && (
        <Suspense fallback={null}>
          <FromTextbookSheet
            initial={{ book: fromBook, classes: [classLabel(cls.name)] }}
            onClose={() => {
              setFromBook(null);
              void qc.invalidateQueries({ queryKey: classSubjectsKey(cls.id) });
            }}
          />
        </Suspense>
      )}
      {uploadFor && (
        <Suspense fallback={null}>
          <KtpUploadSheet
            classId={cls.id}
            className={cls.name}
            subjectKey={uploadFor}
            onClose={() => {
              setUploadFor(null);
              void qc.invalidateQueries({ queryKey: classSubjectsKey(cls.id) });
            }}
          />
        </Suspense>
      )}
    </section>
  );
}

/** «Бүгүн» / «Эртең» before the date when it is that close. */
function useLessonDate(): (iso: string) => string {
  const { t } = useTranslation();
  const lang = useLang();
  return (iso) => {
    const d = parseIso(iso);
    if (!d) return iso;
    const date = fmtDate(d, lang, { weekday: true });
    const today = todayIso();
    if (iso === today) return `${t('teacherHome.next.today')} · ${date}`;
    if (iso === addDays(today, 1)) return `${t('teacherHome.next.tomorrow')} · ${date}`;
    return date;
  };
}

function SubjectCard({
  cls,
  item,
  primary,
  canRemove,
  onUpload,
  onFromBook,
  onClass,
  onRemove,
}: {
  cls: SchoolClass;
  item: ClassSubject;
  primary: boolean;
  canRemove: boolean;
  onUpload: () => void;
  onFromBook: (b: Book) => void;
  onClass: (c: SchoolClass) => void;
  onRemove: () => Promise<unknown>;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const qc = useQueryClient();
  const catalog = useCatalog();
  const canPlan = usePermission('lesson.plan');
  const subjectTitle = useSubjectTitle();
  const lessonDate = useLessonDate();
  const { busy, run } = useDownloads();
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const subject = catalog.data?.subjects.find((s) => s.key === item.subjectKey);
  const sw = subject ? subjectSwatch(subject.hue, theme) : null;
  const title = subjectTitle(item.subjectKey);
  const headingId = `subject-${item.subjectKey}`;
  const parsed = item.ktp.status === 'parsed' && item.ktp.planId;
  const next = item.nextLesson;
  const topic = next?.topicKey ? catalog.data?.topics.find((x) => x.key === next.topicKey) : undefined;
  const { done, total } = item.progress;
  const planHref = parsed ? `/${lang}/teacher/ktp/${item.ktp.planId}` : '';
  const book = useClassBook(cls, item.subjectKey, canPlan);

  /** The КТП column this class is linked to — the plan's `class` for the .docx. */
  const download = (planId: string, index: number) =>
    run(`next-${item.subjectKey}`, async () => {
      const plan = await qc.fetchQuery<TeachingPlan>({ queryKey: ktpKeys.plan(planId), queryFn: () => api('ktpGet', { params: { id: planId } }) });
      const col = Object.entries(plan.classLinks ?? {}).find(([, id]) => id === cls.id)?.[0] ?? plan.classes[0];
      return fetchLessonPlan(planId, index, col);
    });

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      toast({ key: 'teacherHome.subjects.removed', params: { subject: title, name: cls.name }, kind: 'success' });
    } catch (e) {
      toast({ key: errorKey(e), kind: 'error' });
      setRemoving(false);
      setConfirm(false);
    }
  };

  return (
    <li className={cx(cardCls, 'grid content-start gap-4 md:p-5')} aria-labelledby={headingId} data-testid="subject-card">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-11 flex-none items-center justify-center rounded-pill bg-soft text-accent" style={sw ? { background: sw.bg, color: sw.fg } : undefined} aria-hidden="true">
          <Icon name={subject?.icon ?? 'book'} />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 id={headingId} className="m-0 font-serif text-lg font-bold text-ink">
            {title}
          </h3>
          {parsed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="ok">
                <Icon name="check" className="sm" />
                {t('teacherHome.ktp.ready')}
              </Chip>
              {book.chosen && <Chip>{t('teacherHome.ktp.main')}</Chip>}
              <ProblemCount errors={item.ktp.errors} warnings={item.ktp.warnings} />
            </div>
          ) : (
            <div>
              <Chip>
                <Icon name="file" className="sm" />
                {t('teacherHome.ktp.none')}
              </Chip>
            </div>
          )}
        </div>
        {canRemove && !confirm && (
          <button type="button" className={iconBtn('-me-2 -mt-1')} onClick={() => setConfirm(true)} aria-label={t('teacherHome.subjects.removeLabel', { subject: title, name: cls.name })} title={t('teacherHome.subjects.removeLabel', { subject: title, name: cls.name })}>
            <Icon name="trash" className="sm" />
          </button>
        )}
      </div>

      {confirm && (
        <div className="grid gap-3 rounded-lg border border-bad p-3" role="group" aria-label={t('teacherHome.subjects.removeLabel', { subject: title, name: cls.name })}>
          <p className="m-0 text-base text-ink">{t('teacherHome.subjects.removeConfirm', { subject: title, name: cls.name })}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btn('danger')} disabled={removing} onClick={() => void remove()}>
              <Icon name="trash" className="sm" />
              {t('teacherHome.subjects.removeYes')}
            </button>
            <button type="button" className={btn('ghost')} autoFocus onClick={() => setConfirm(false)} disabled={removing}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {canPlan && <ClassBookLine cls={cls} subjectKey={item.subjectKey} subjectTitle={title} book={book} onClass={onClass} />}

      {parsed ? (
        <>
          <div className="grid gap-2 rounded-lg bg-soft p-4">
            <p className="m-0 text-sm font-semibold text-muted">{t('teacherHome.next.title')}</p>
            {next ? (
              <>
                <p className="m-0 text-base font-semibold text-ink">{lessonDate(next.date)}</p>
                <p className="m-0 text-base text-ink">
                  <span className="text-muted">{t('ktp.problems.lesson', { n: next.index })} · </span>
                  {next.title}
                </p>
                {next.topicKey && (
                  <Link to={topicPath(catalog.data, lang, next.topicKey, item.subjectKey)} className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold text-accent">
                    <Icon name="cube" className="sm" />
                    {topic ? tr(topic.title, lang) : next.topicKey}
                  </Link>
                )}
                {canPlan && (
                  <button
                    type="button"
                    className={btn('secondary', 'justify-self-start')}
                    disabled={busy !== null}
                    aria-label={t('teacherHome.next.planLabel', { n: next.index, title: next.title })}
                    onClick={() => void download(item.ktp.planId!, next.index)}
                  >
                    <Icon name={busy ? 'sync' : 'download'} className={cx('sm', busy && 'spin')} />
                    {t('teacherHome.next.plan')}
                  </button>
                )}
              </>
            ) : (
              <p className="m-0 text-base text-ink">{t('teacherHome.next.none')}</p>
            )}
          </div>
          {total > 0 && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-muted">{t('teacherHome.progress.title')}</span>
                <span className="text-base font-semibold text-ink">{t('teacherHome.progress.value', { done, count: total })}</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-pill bg-soft"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-label={t('teacherHome.progress.label', { subject: title })}
                aria-valuetext={t('teacherHome.progress.value', { done, count: total })}
              >
                <span className="block h-full rounded-pill bg-accent" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
              </div>
            </div>
          )}
          {canPlan && (
            <Link to={planHref} className={btn('ghost', 'justify-self-start')}>
              {t('teacherHome.ktp.open')}
              <Icon name="arrow-right" className="sm" />
            </Link>
          )}
        </>
      ) : (
        <div className="grid gap-3">
          <p className="m-0 text-base text-muted">{t(book.chosen ? 'teacherHome.ktp.fromBookHint' : 'teacherHome.ktp.noneHint')}</p>
          {canPlan && (
            <div className="flex flex-wrap gap-3">
              {book.chosen && (
                <button type="button" className={btn(primary ? 'primary' : 'secondary')} onClick={() => onFromBook(book.chosen!)} aria-label={t('teacherHome.ktp.fromBookLabel', { subject: title, name: cls.name })}>
                  <Icon name="book" className="sm" />
                  {t('teacherHome.ktp.fromBook')}
                </button>
              )}
              <button type="button" className={btn(primary && !book.chosen ? 'primary' : book.chosen ? 'ghost' : 'secondary', 'justify-self-start')} onClick={onUpload} aria-label={t('teacherHome.ktp.uploadLabel', { subject: title, name: cls.name })}>
                <Icon name="upload" className="sm" />
                {t(book.chosen ? 'teacherHome.ktp.uploadOwn' : 'teacherHome.ktp.upload')}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AddSubjectsSheet({ current, onClose, onSave }: { current: string[]; onClose: () => void; onSave: (added: string[]) => Promise<unknown> }): JSX.Element {
  const { t } = useTranslation();
  const [value, setValue] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.length) {
      setError(t('teacher.classForm.subjectsRequired'));
      document.querySelector<HTMLElement>('#add-subjects button')?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      toast({ key: 'teacherHome.subjects.added', kind: 'success' });
    } catch (e) {
      setError(t(errorKey(e)));
      setBusy(false);
    }
  };
  return (
    <Sheet title={t('teacherHome.subjects.addTitle')} onClose={onClose}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <SubjectToggles id="add-subjects" value={value} onChange={setValue} exclude={current} error={error} disabled={busy} />
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={btn('primary')} disabled={busy}>
            <Icon name="check" className="sm" />
            {t('teacherHome.subjects.addSave')}
          </button>
          <button type="button" className={btn('ghost')} onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
