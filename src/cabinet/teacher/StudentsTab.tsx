/**
 * Class roster (W-53, scenario «Учитель» 2): server-paginated list, add by
 * list or CSV import, PIN reset, printable login cards. PINs are returned only
 * once (on create / reset), so they live in component state for printing.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { fetchClassStudents } from '../../api/extensions';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey, readFileText } from '../format';

export function StudentsTab({ cls }: { cls: SchoolClass }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [names, setNames] = useState('');
  const [pins, setPins] = useState<Record<string, { name: string; pin: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const roster = useInfiniteQuery({
    queryKey: ['students', cls.id],
    queryFn: ({ pageParam }) => fetchClassStudents(cls.id, pageParam ?? undefined, 20),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const students = roster.data?.pages.flatMap((p) => p.items) ?? [];

  const add = async (body: { students: { displayName: string }[] } | { csv: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api('classStudentsAdd', { params: { id: cls.id }, body });
      setPins((p) => ({ ...p, ...Object.fromEntries(res.items.map((i) => [i.student.id, { name: i.student.displayName, pin: i.pin }])) }));
      toast({ key: 'teacher.added', params: { count: res.items.length }, kind: 'success' });
      setNames('');
      await qc.invalidateQueries({ queryKey: ['students', cls.id] });
      await qc.invalidateQueries({ queryKey: ['classes'] });
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const submitNames = (e: FormEvent) => {
    e.preventDefault();
    const list = names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (list.length) void add({ students: list.map((displayName) => ({ displayName })) });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const csv = await readFileText(file);
    if (csv.trim()) await add({ csv });
    if (fileRef.current) fileRef.current.value = '';
  };

  const resetPin = async (id: string, name: string) => {
    try {
      const { pin } = await api('studentResetPin', { params: { id }, body: {} });
      setPins((p) => ({ ...p, [id]: { name, pin } }));
      toast({ key: 'teacher.pinReset', params: { name, pin }, kind: 'success' });
    } catch (e) {
      toast({ key: errorKey(e), kind: 'error' });
    }
  };

  const cards = Object.entries(pins);

  return (
    <div className="stack">
      {roster.isError && <p className="error-text">{t('teacher.loadError')}</p>}
      {students.length === 0 && !roster.isLoading && <p className="muted">{t('teacher.rosterEmpty')}</p>}
      {students.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t('teacher.student')}</th>
                <th scope="col">{t('teacher.pin')}</th>
                <th scope="col">{t('teacher.consent')}</th>
                <th scope="col">{t('teacher.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.displayName}</td>
                  <td>{pins[s.id] ? <b>{pins[s.id].pin}</b> : <span className="muted">{t('teacher.pinUnknown')}</span>}</td>
                  <td>{s.hasConsent ? t('teacher.consentYes') : t('teacher.consentNo')}</td>
                  <td>
                    <button type="button" className="btn btn--sm" onClick={() => void resetPin(s.id, s.displayName)} aria-label={t('teacher.resetPinFor', { name: s.displayName })}>
                      <Icon name="reset" size={16} />
                      {t('teacher.resetPin')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {roster.hasNextPage && (
        <div>
          <button type="button" className="btn btn--sm" onClick={() => void roster.fetchNextPage()} disabled={roster.isFetchingNextPage}>
            {t('teacher.loadMore')}
          </button>
        </div>
      )}

      <form className="stack" onSubmit={submitNames}>
        <h3>{t('teacher.addStudents')}</h3>
        <label className="field">
          <span>{t('teacher.namesLabel')}</span>
          <textarea className="input" value={names} onChange={(e) => setNames(e.target.value)} rows={4} />
        </label>
        <div className="row">
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !names.trim()}>
            <Icon name="plus" size={16} />
            {t('teacher.add')}
          </button>
          <label className="btn btn--sm">
            <Icon name="upload" size={16} />
            {t('teacher.importCsv')}
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        </div>
        <span className="muted small">{t('teacher.csvHint')}</span>
        <p className="error-text" role="alert">
          {error ?? ''}
        </p>
      </form>

      {cards.length > 0 && (
        <section className="stack" aria-labelledby="cards-title">
          <div className="row">
            <h3 id="cards-title">{t('teacher.cardsTitle')}</h3>
            <button type="button" className="btn btn--sm" onClick={() => window.print()}>
              <Icon name="print" size={16} />
              {t('teacher.printCards')}
            </button>
          </div>
          <span className="muted small">{t('teacher.printHint')}</span>
          <div className="print-area">
            <div className="print-cards">
              {cards.map(([id, c]) => (
                <div key={id} className="login-card">
                  <dl>
                    <dt>{t('teacher.card.class')}</dt>
                    <dd>{cls.name}</dd>
                    <dt>{t('teacher.card.code')}</dt>
                    <dd>{cls.joinCode}</dd>
                    <dt>{t('teacher.card.name')}</dt>
                    <dd>{c.name}</dd>
                    <dt>{t('teacher.card.pin')}</dt>
                    <dd data-testid="card-pin">{c.pin}</dd>
                  </dl>
                  <span className="small">{t('teacher.card.where', { url: `${location.host}/login` })}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
