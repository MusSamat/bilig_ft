/**
 * КТП → сабак планы (contract 0.5.0, permission `lesson.plan`): Query hooks over
 * ktpList / ktpCreate / ktpGet / ktpPatch / ktpDelete and the .docx downloads.
 *
 * Edits are optimistic and serialized: each PATCH is sent with the version the
 * cache holds when it is sent (If-Match), so quick successive edits never race
 * each other into a 409. A real conflict (someone else changed the plan)
 * refetches the plan and tells the teacher.
 */
import { useCallback, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DOCX_MEDIA_TYPE, type KtpPatchRequest, type KtpRowPatch, type TeachingPlan, type TeachingPlanList } from '@bilig/content-model/api';
import type { Lang } from '@bilig/content-model';
import { api, isApiError, rawCall } from '../api/client';
import { toast } from '../state/ui';
import { readDownload, saveFile, type Download } from '../lib/download';
import { applyRowPatches, checkKtpFile, chunkRange, fileToBase64 } from './model';

export const ktpKeys = {
  all: ['ktp'] as const,
  list: ['ktp', 'list'] as const,
  plan: (id: string) => ['ktp', 'plan', id] as const,
};

export const useKtpList = () =>
  useInfiniteQuery({
    queryKey: ktpKeys.list,
    queryFn: ({ pageParam, signal }) =>
      api('ktpList', {
        query: { limit: 20, cursor: pageParam ?? undefined },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: TeachingPlanList) => last.nextCursor,
  });

export const useKtpPlan = (id: string | undefined) =>
  useQuery({
    queryKey: ktpKeys.plan(id ?? ''),
    queryFn: ({ signal }) => api('ktpGet', { params: { id: id! }, signal }),
    enabled: !!id,
    retry: (n, e) => n < 1 && !(isApiError(e) && [401, 403, 404].includes(e.status)),
  });

/** Thrown before any request when the picked file fails the client checks. */
export class KtpFileError extends Error {
  constructor(readonly i18nKey: string) {
    super(i18nKey);
    this.name = 'KtpFileError';
  }
}

export async function uploadKtp(file: File, lang?: Lang): Promise<TeachingPlan> {
  const bad = checkKtpFile(file);
  if (bad) throw new KtpFileError(bad);
  const data = await fileToBase64(file);
  return api('ktpCreate', {
    body: { fileName: file.name, data, ...(lang ? { lang } : {}) },
  });
}

export function useKtpUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, lang }: { file: File; lang?: Lang }) => uploadKtp(file, lang),
    onSuccess: (plan) => {
      qc.setQueryData(ktpKeys.plan(plan.id), plan);
      void qc.invalidateQueries({ queryKey: ktpKeys.list });
    },
  });
}

export function useKtpDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => api('ktpDelete', { params: { id }, ifMatch: version }),
    onSuccess: (_r, { id }) => {
      qc.removeQueries({ queryKey: ktpKeys.plan(id) });
      void qc.invalidateQueries({ queryKey: ktpKeys.list });
    },
  });
}

type PlanFields = Omit<KtpPatchRequest, 'version' | 'rows'>;
interface Pending {
  rows: KtpRowPatch[];
  fields: PlanFields;
}

const applyPending = (plan: TeachingPlan, p: Pending): TeachingPlan => ({
  ...applyRowPatches(plan, p.rows),
  ...p.fields,
});

export const isConflict = (e: unknown): boolean => isApiError(e) && e.status === 409;

/** PATCH /ktp/:id with optimistic UI, a send queue and 409 handling. */
export function useKtpPatch(id: string) {
  const qc = useQueryClient();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef<Pending[]>([]);

  return useCallback(
    (rows: KtpRowPatch[], fields: PlanFields = {}): Promise<TeachingPlan | null> => {
      const key = ktpKeys.plan(id);
      const entry: Pending = { rows, fields };
      pending.current.push(entry);
      const before = qc.getQueryData<TeachingPlan>(key);
      if (before) qc.setQueryData(key, applyPending(before, entry));
      const run = queue.current.then(() => send(qc, id, entry, pending.current));
      queue.current = run.catch(() => undefined);
      return run;
    },
    [qc, id],
  );
}

async function send(qc: QueryClient, id: string, entry: Pending, pending: Pending[]): Promise<TeachingPlan | null> {
  const key = ktpKeys.plan(id);
  const done = () => {
    const i = pending.indexOf(entry);
    if (i >= 0) pending.splice(i, 1);
  };
  const current = qc.getQueryData<TeachingPlan>(key);
  if (!current) {
    done();
    return null;
  }
  try {
    const body: KtpPatchRequest = {
      version: current.version,
      ...entry.fields,
      ...(entry.rows.length ? { rows: entry.rows } : {}),
    };
    const saved = await api('ktpPatch', {
      params: { id },
      body,
      ifMatch: current.version,
    });
    done();
    // The server's plan (recomputed issues, new version) plus edits still waiting to be sent.
    qc.setQueryData(key, pending.reduce(applyPending, saved));
    void qc.invalidateQueries({ queryKey: ktpKeys.list, refetchType: 'none' });
    return saved;
  } catch (e) {
    done();
    pending.length = 0;
    if (isConflict(e)) toast({ key: 'ktp.conflict', kind: 'error' });
    else
      toast({
        key: isApiError(e) ? e.i18nKey : 'ktp.saveError',
        kind: 'error',
      });
    await qc.invalidateQueries({ queryKey: key });
    return null;
  }
}

export type { Download };
export { saveFile };

const downloadDocx = readDownload;

const DOCX_HEADERS = { Accept: `${DOCX_MEDIA_TYPE}, application/problem+json` };

/** GET /ktp/:id/lessons/:index/plan?class= — one lesson plan (.docx). */
export async function fetchLessonPlan(id: string, index: number, cls: string, lang?: Lang): Promise<Download> {
  const res = await rawCall('ktpLessonPlan', {
    params: { id, index: String(index) },
    query: { class: cls, lang },
    headers: DOCX_HEADERS,
  });
  return downloadDocx(res, `plan-${cls}-${index}.docx`);
}

/** GET /ktp/:id/plans?class=&from=&to= — lessons from..to in one .docx. */
export async function fetchLessonPlans(id: string, cls: string, from: number, to: number, lang?: Lang): Promise<Download> {
  const res = await rawCall('ktpLessonPlans', {
    params: { id },
    query: { class: cls, from, to, lang },
    headers: DOCX_HEADERS,
  });
  return downloadDocx(res, `plans-${cls}-${from}-${to}.docx`);
}

/** Lessons `range` (by index) as files of at most KTP_MAX_RANGE lessons, fetched one after another. */
export async function fetchRangeParts(id: string, cls: string, range: { from: number; to: number }, lang?: Lang): Promise<Download[]> {
  const out: Download[] = [];
  for (const part of chunkRange(range)) out.push(await fetchLessonPlans(id, cls, part.from, part.to, lang));
  return out;
}

/** Run a download with a busy marker per button; errors become a toast. */
export function useDownloads() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fetcher: () => Promise<Download | Download[]>) => {
    setBusy(key);
    try {
      const files = await fetcher();
      for (const f of Array.isArray(files) ? files : [files]) saveFile(f);
      toast({ key: 'ktp.downloaded', kind: 'success' });
    } catch (e) {
      toast({
        key: isApiError(e) ? e.i18nKey : 'ktp.downloadError',
        kind: 'error',
      });
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, run };
}
