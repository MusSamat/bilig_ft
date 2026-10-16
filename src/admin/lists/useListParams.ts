/**
 * List state in the URL (TZ §5 «фильтры в URL»): filters, current cursor, the
 * trail of previous cursors (for «назад» with cursor pagination), sort and limit.
 * A changed filter or sort resets paging.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ENDPOINTS, type EndpointName } from '@bilig/content-model/api';
import { z } from 'zod';

const RESERVED = new Set(['cursor', 'trail', 'sort', 'limit']);
const FIRST = '_';

export interface ListParams {
  filters: Record<string, string>;
  cursor?: string;
  page: number;
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit: number;
  setFilter(key: string, value: string | undefined): void;
  setFilters(values: Record<string, string | undefined>): void;
  next(cursor: string): void;
  prev(): void;
  first(): void;
  toggleSort(field: string): void;
  setLimit(n: number): void;
  /**
   * Query object for the API: filters + cursor + limit, plus `sort` / `order`
   * when the server sorts (`true` = by the URL sort field, a string = by that
   * server field instead).
   */
  query(serverSort?: boolean | string): Record<string, string | number | undefined>;
}

export function useListParams(filterKeys: readonly string[], defaultLimit = 25): ListParams {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of filterKeys) {
      const v = sp.get(k);
      if (v !== null && v !== '' && !RESERVED.has(k)) out[k] = v;
    }
    return out;
  }, [sp, filterKeys]);
  const cursor = sp.get('cursor') ?? undefined;
  const trail = (sp.get('trail') ?? '').split(',').filter(Boolean);
  const rawSort = sp.get('sort');
  const sort = rawSort ? { field: rawSort.replace(/^-/, ''), dir: rawSort.startsWith('-') ? ('desc' as const) : ('asc' as const) } : undefined;
  const limit = Number(sp.get('limit')) || defaultLimit;

  const update = useCallback(
    (fn: (p: URLSearchParams) => void) =>
      setSp(
        (prev) => {
          const p = new URLSearchParams(prev);
          fn(p);
          return p;
        },
        { replace: false },
      ),
    [setSp],
  );
  const resetPaging = (p: URLSearchParams) => {
    p.delete('cursor');
    p.delete('trail');
  };

  return {
    filters,
    cursor,
    page: trail.length + 1,
    sort,
    limit,
    setFilter: (key, value) =>
      update((p) => {
        if (value === undefined || value === '') p.delete(key);
        else p.set(key, value);
        resetPaging(p);
      }),
    setFilters: (values) =>
      update((p) => {
        for (const [k, v] of Object.entries(values)) {
          if (v === undefined || v === '') p.delete(k);
          else p.set(k, v);
        }
        resetPaging(p);
      }),
    next: (c) =>
      update((p) => {
        const t = (p.get('trail') ?? '').split(',').filter(Boolean);
        t.push(p.get('cursor') ?? FIRST);
        p.set('trail', t.join(','));
        p.set('cursor', c);
      }),
    prev: () =>
      update((p) => {
        const t = (p.get('trail') ?? '').split(',').filter(Boolean);
        const last = t.pop();
        if (t.length) p.set('trail', t.join(','));
        else p.delete('trail');
        if (!last || last === FIRST) p.delete('cursor');
        else p.set('cursor', last);
      }),
    first: () => update(resetPaging),
    toggleSort: (field) =>
      update((p) => {
        const cur = p.get('sort');
        p.set('sort', cur === field ? `-${field}` : field);
        resetPaging(p);
      }),
    setLimit: (n) =>
      update((p) => {
        p.set('limit', String(n));
        resetPaging(p);
      }),
    query: (serverSort = false) => ({
      ...filters,
      ...(cursor ? { cursor } : {}),
      limit,
      ...(serverSort && sort ? { sort: typeof serverSort === 'string' ? serverSort : sort.field, order: sort.dir } : {}),
    }),
  };
}

const sortSchema = (name: EndpointName): z.ZodTypeAny | undefined => {
  const q = (ENDPOINTS[name] as { query?: z.ZodTypeAny }).query;
  return q instanceof z.ZodObject ? (q.shape as Record<string, z.ZodTypeAny>).sort : undefined;
};

/** Does the endpoint's query schema accept a `sort` parameter at all? (contract 0.3.0: every admin list.) */
export function supportsServerSort(name: EndpointName): boolean {
  return !!sortSchema(name);
}

/**
 * Can the server sort this list by `field`? The fixed lists (users, audit,
 * builds…) take an enum of fields; a column outside it is sorted on the
 * loaded page only, and the UI says so.
 */
export function serverSortable(name: EndpointName, field: string): boolean {
  return !!sortSchema(name)?.safeParse(field).success;
}

/** Keep only the query keys the endpoint's schema declares (unknown URL params never reach the API). */
export function pickQuery(name: EndpointName, query: Record<string, unknown>): Record<string, unknown> {
  const q = (ENDPOINTS[name] as { query?: z.ZodTypeAny }).query;
  if (!q || !(q instanceof z.ZodObject)) return {};
  const keys = Object.keys(q.shape);
  return Object.fromEntries(Object.entries(query).filter(([k]) => keys.includes(k)));
}
