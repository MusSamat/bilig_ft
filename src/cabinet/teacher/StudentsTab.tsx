/**
 * «Окуучулар»: the class roster (server pagination), adding students by names
 * or a CSV file (in a sheet), a new PIN (asks first: the old one stops
 * working), printable sign-in cards. PINs come back only once (on add / new
 * PIN), so they live in component state for the cards.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass, Student } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { fetchClassStudents } from '../../api/extensions';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey, readFileText } from '../format';
import { Chip, EmptyState, ErrorState, Field, Loading, Sheet, btn, cx, inputCls } from './ui';

type Pins = Record<string, { name: string; pin: string }>;

export function StudentsTab({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const [pins, setPins] = useState<Pins>({});
  const [adding, setAdding] = useState(false);
  const roster = useInfiniteQuery({
    queryKey: ['students', cls.id],
    queryFn: ({ pageParam }) => fetchClassStudents(cls.id, pageParam ?? undefined, 20),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const students = roster.data?.pages.flatMap((p) => p.items) ?? [];
  const cards = Object.entries(pins);
  const add = (
    <button type="button" className={btn('primary')} onClick={() => setAdding(true)}>
      <Icon name="plus" className="sm" />
      {t('teacher.addStudents')}
    </button>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-ink">{t('teacher.studentsTitle', { count: cls.studentCount })}</h2>
        {students.length > 0 && add}
      </div>
      {roster.isLoading && <Loading rows={3} />}
      {roster.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void roster.refetch()} />}
      {roster.isSuccess && students.length === 0 && <EmptyState icon="users" title={t('teacher.rosterEmpty')} text={t('teacher.rosterEmptyText')} action={add} />}
      {students.length > 0 && (
        <ul className="m-0 grid list-none divide-y divide-line rounded-lg border border-line p-0" aria-label={t('teacher.rosterLabel')}>
          {students.map((s) => (
            <StudentRow key={s.id} student={s} pin={pins[s.id]?.pin} onPin={(pin) => setPins((p) => ({ ...p, [s.id]: { name: s.displayName, pin } }))} />
          ))}
        </ul>
      )}
      {roster.hasNextPage && (
        <div>
          <button type="button" className={btn('secondary')} onClick={() => void roster.fetchNextPage()} disabled={roster.isFetchingNextPage}>
            {t('teacher.loadMore')}
          </button>
        </div>
      )}
      {cards.length > 0 && <LoginCards cls={cls} cards={cards} />}
      {adding && (
        <AddStudentsSheet
          cls={cls}
          onClose={() => setAdding(false)}
          onAdded={(added) => {
            setPins((p) => ({ ...p, ...added }));
            setAdding(false);
            requestAnimationFrame(() => document.getElementById('cards-title')?.focus());
          }}
        />
      )}
    </div>
  );
}

function StudentRow({ student: s, pin, onPin }: { student: Student; pin?: string; onPin: (pin: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      const res = await api('studentResetPin', { params: { id: s.id }, body: {} });
      onPin(res.pin);
      toast({ key: 'teacher.pinReset', params: { name: s.displayName, pin: res.pin }, kind: 'success' });
    } catch (e) {
      toast({ key: errorKey(e), kind: 'error' });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="grid min-w-0 flex-1 basis-40 gap-1">
        <span className="font-semibold text-ink">{s.displayName}</span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {pin ? (
            <span>
              {t('teacher.pin')}: <b className="font-mono text-md text-ink">{pin}</b>
            </span>
          ) : (
            <span>{t('teacher.pinHidden')}</span>
          )}
          {!s.hasConsent && <Chip tone="warn">{t('teacher.noConsent')}</Chip>}
        </span>
      </div>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('teacher.resetPinConfirm', { name: s.displayName })}>
          <span className="text-sm text-ink">{t('teacher.resetPinConfirm', { name: s.displayName })}</span>
          <button type="button" className={btn('danger')} disabled={busy} onClick={() => void reset()}>
            {t('teacher.resetPinYes')}
          </button>
          <button type="button" className={btn('ghost')} onClick={() => setConfirm(false)} autoFocus>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className={btn('ghost')} onClick={() => setConfirm(true)} aria-label={t('teacher.resetPinFor', { name: s.displayName })}>
          <Icon name="key" className="sm" />
          {t('teacher.resetPin')}
        </button>
      )}
    </li>
  );
}

function AddStudentsSheet({ cls, onClose, onAdded }: { cls: SchoolClass; onClose: () => void; onAdded: (p: Pins) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [names, setNames] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async (body: { students: { displayName: string }[] } | { csv: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api('classStudentsAdd', { params: { id: cls.id }, body });
      toast({ key: 'teacher.added', params: { count: res.items.length }, kind: 'success' });
      await qc.invalidateQueries({ queryKey: ['students', cls.id] });
      await qc.invalidateQueries({ queryKey: ['classes'] });
      onAdded(Object.fromEntries(res.items.map((i) => [i.student.id, { name: i.student.displayName, pin: i.pin }])));
    } catch (e) {
      setError(t(errorKey(e)));
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const list = names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return setError(t('teacher.namesRequired'));
    void add({ students: list.map((displayName) => ({ displayName })) });
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const csv = await readFileText(file);
    if (csv.trim()) await add({ csv });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Sheet title={t('teacher.addStudentsTo', { name: cls.name })} onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field id="add-names" label={t('teacher.namesLabel')} hint={t('teacher.namesHint')} error={error}>
          <textarea id="add-names" className={cx(inputCls, 'min-h-32 py-3')} value={names} onChange={(e) => setNames(e.target.value)} rows={5} aria-describedby="add-names-hint add-names-error" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={btn('primary')} disabled={busy}>
            <Icon name="plus" className="sm" />
            {t('teacher.add')}
          </button>
        </div>
        <div className="grid gap-2 border-t border-line pt-4">
          <span className="text-sm text-muted">{t('teacher.csvHint')}</span>
          <label className={btn('secondary', 'justify-self-start focus-within:outline-3 focus-within:outline-accent')}>
            <Icon name="upload" className="sm" />
            {t('teacher.importCsv')}
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        </div>
      </form>
    </Sheet>
  );
}

function LoginCards({ cls, cards }: { cls: SchoolClass; cards: [string, { name: string; pin: string }][] }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="grid gap-3 rounded-lg border border-accent p-4" aria-labelledby="cards-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="cards-title" tabIndex={-1} className="font-serif text-lg font-bold text-ink">
          {t('teacher.cardsTitle')}
        </h3>
        <button type="button" className={btn('primary')} onClick={() => window.print()}>
          <Icon name="print" className="sm" />
          {t('teacher.printCards')}
        </button>
      </div>
      <p className="text-sm text-muted">{t('teacher.printHint')}</p>
      <div className="print-area">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(([id, c]) => (
            <div key={id} className="grid gap-1 rounded-md border-2 border-dashed border-line p-3 [break-inside:avoid] print:border-[#000]">
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                <dt className="text-muted print:text-[#333]">{t('teacher.card.class')}</dt>
                <dd className="m-0 font-bold">{cls.name}</dd>
                <dt className="text-muted print:text-[#333]">{t('teacher.card.code')}</dt>
                <dd className="m-0 font-bold">{cls.joinCode}</dd>
                <dt className="text-muted print:text-[#333]">{t('teacher.card.name')}</dt>
                <dd className="m-0 font-bold">{c.name}</dd>
                <dt className="text-muted print:text-[#333]">{t('teacher.card.pin')}</dt>
                <dd className="m-0 font-bold" data-testid="card-pin">
                  {c.pin}
                </dd>
              </dl>
              <span className="text-sm">{t('teacher.card.where', { url: `${location.host}/login` })}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
