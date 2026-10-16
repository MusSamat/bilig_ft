/**
 * Generic admin list: server cursor pages, URL filters, sortable columns,
 * row selection and bulk actions (shown only when permitted).
 */
import { keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import type { EndpointName } from '@bilig/content-model/api';
import type { CallOpts, Resp } from '../api/client';
import { useApiQuery } from '../api/hooks';
import { useT } from '../i18n';
import { Icon } from '../lib/icons';
import { EmptyState, ErrorBox } from '../shell/ui';
import { pickQuery, serverSortable, type ListParams } from './useListParams';

export interface Column<R> {
  key: string;
  header: ReactNode;
  render(row: R): ReactNode;
  /** Value used for sorting (absent → not sortable). */
  sortValue?(row: R): string | number | undefined;
  /** Server sort field when it differs from `key` (the server sorts whenever the list accepts it). */
  sortField?: string;
  className?: string;
}

export interface BulkAction<R> {
  id: string;
  label: ReactNode;
  run(rows: R[]): Promise<unknown> | void;
  danger?: boolean;
}

type PageOf<N extends EndpointName> = Resp<N> extends { items: (infer I)[]; nextCursor: string | null } ? I : never;

/** The server field the list's current sort maps to, when the endpoint can sort by it. */
export function serverSortField<R>(name: EndpointName, list: ListParams, columns: readonly Column<R>[] = []): string | undefined {
  if (!list.sort) return undefined;
  const col = columns.find((c) => c.key === list.sort!.field);
  const field = col?.sortField ?? list.sort.field;
  return serverSortable(name, field) ? field : undefined;
}

/** Fetch one cursor page of `name` with the list's URL state (+ fixed query). */
export function useCursorList<N extends EndpointName>(name: N, list: ListParams, extra: Record<string, unknown> = {}, opts: Omit<CallOpts<N>, 'query'> = {}, sortField = serverSortField(name, list)) {
  const query = pickQuery(name, { ...list.query(sortField ?? false), ...extra });
  return useApiQuery(name, { ...opts, query: query as CallOpts<N>['query'] }, { placeholderData: keepPreviousData });
}

export function sortRows<R>(rows: readonly R[], columns: readonly Column<R>[], sort: ListParams['sort']): R[] {
  if (!sort) return [...rows];
  const col = columns.find((c) => c.key === sort.field);
  if (!col?.sortValue) return [...rows];
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.sortValue!(a);
    const y = col.sortValue!(b);
    if (x === y) return 0;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return (x < y ? -1 : 1) * dir;
  });
}

export interface ListViewProps<N extends EndpointName, R = PageOf<N>> {
  endpoint: N;
  list: ListParams;
  columns: Column<R>[];
  rowKey(row: R): string;
  extraQuery?: Record<string, unknown>;
  params?: Record<string, string>;
  bulkActions?: BulkAction<R>[];
  onRowClick?(row: R): void;
  /** Client-side refinement of the loaded page (only for filters the API cannot do). */
  refine?(rows: R[]): R[];
  empty?: ReactNode;
  caption?: ReactNode;
}

export function ListView<N extends EndpointName, R = PageOf<N>>(props: ListViewProps<N, R>) {
  const t = useT();
  const { list, columns, rowKey, bulkActions = [] } = props;
  const sortField = serverSortField(props.endpoint, list, columns);
  const q = useCursorList(props.endpoint, list, props.extraQuery, props.params ? ({ params: props.params } as never) : {}, sortField);
  const data = q.data as { items: R[]; nextCursor: string | null } | undefined;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const refined = props.refine ? props.refine(items) : items;
    // The server already returns the page in order; re-sorting could disagree with its collation.
    return sortField ? refined : sortRows(refined, columns, list.sort);
  }, [data, columns, list.sort, props.refine, sortField]);
  const selRows = rows.filter((r) => selected.has(rowKey(r)));
  const allSel = rows.length > 0 && selRows.length === rows.length;

  const cols = columns.length + (bulkActions.length > 0 ? 1 : 0);
  return (
    <div className="adm-list">
      {q.error && <ErrorBox error={q.error} />}
      <div className="adm-tablewrap">
        <table className="adm-table">
          {props.caption && <caption>{props.caption}</caption>}
          <thead>
            <tr>
              {bulkActions.length > 0 && (
                <th className="adm-table__check">
                  <input type="checkbox" aria-label={t('list.selectAll')} checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(rows.map(rowKey)))} />
                </th>
              )}
              {columns.map((c) => {
                const active = list.sort?.field === c.key;
                return (
                  <th key={c.key} className={c.className} aria-sort={active ? (list.sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortValue ? (
                      <button type="button" className={`adm-sort${active ? ' is-active' : ''}`} onClick={() => list.toggleSort(c.key)}>
                        {c.header}
                        <Icon id={active ? (list.sort!.dir === 'asc' ? 'up' : 'down') : 'sort'} size={14} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {q.isLoading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk${i}`} className="adm-skel-row" aria-hidden={i > 0 ? true : undefined}>
                  <td colSpan={cols}>
                    {i === 0 && <span className="adm-sr">{t('common.loading')}</span>}
                    <i style={{ width: `${88 - ((i * 13) % 36)}%` }} />
                  </td>
                </tr>
              ))}
            {!q.isLoading && rows.length === 0 && (
              <tr className="adm-empty-row">
                <td colSpan={cols}>
                  <EmptyState title={props.empty ?? t('list.empty')} hint={t('list.emptyHint')} />
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const k = rowKey(r);
              const sel = selected.has(k);
              return (
                <tr key={k} className={`${props.onRowClick ? 'is-clickable' : ''}${sel ? ' is-selected' : ''}`.trim() || undefined} onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined}>
                  {bulkActions.length > 0 && (
                    <td className="adm-table__check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t('list.selectRow', { key: k })}
                        checked={sel}
                        onChange={() => {
                          const n = new Set(selected);
                          if (n.has(k)) n.delete(k);
                          else n.add(k);
                          setSelected(n);
                        }}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager list={list} nextCursor={data?.nextCursor ?? null} fetching={q.isFetching} />
      {list.sort && !sortField && <p className="adm-hint">{t('list.sortPageOnly')}</p>}
      {bulkActions.length > 0 && selRows.length > 0 && (
        <div className="adm-bulk" role="region" aria-label={t('list.bulk')} aria-live="polite">
          <span className="adm-bulk__count">
            <Icon id="check" size={18} />
            {t('list.selected', { count: selRows.length })}
          </span>
          {bulkActions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`adm-btn adm-btn--small${a.danger ? ' adm-btn--danger' : ''}`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await a.run(selRows);
                  setSelected(new Set());
                } finally {
                  setBusy(false);
                  void q.refetch();
                }
              }}
            >
              {a.danger && <Icon id="trash" size={16} />}
              {a.label}
            </button>
          ))}
          <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => setSelected(new Set())}>
            {t('list.clearSelection')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Pager({ list, nextCursor, fetching }: { list: ListParams; nextCursor: string | null; fetching?: boolean }) {
  const t = useT();
  return (
    <nav className="adm-pager" aria-label={t('list.pagination')}>
      <button type="button" className="adm-btn adm-btn--small" disabled={list.page <= 1} onClick={() => list.prev()}>
        <Icon id="prev" size={16} />
        {t('list.prev')}
      </button>
      <span className="adm-pager__page">{t('list.page', { page: list.page })}</span>
      <button type="button" className="adm-btn adm-btn--small" disabled={!nextCursor} onClick={() => nextCursor && list.next(nextCursor)}>
        {t('list.next')}
        <Icon id="next" size={16} />
      </button>
      <label className="adm-pager__limit">
        {t('list.perPage')}
        <select value={list.limit} onChange={(e) => list.setLimit(Number(e.target.value))}>
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {fetching && <span className="adm-muted adm-pager__busy">{t('common.loading')}</span>}
    </nav>
  );
}
