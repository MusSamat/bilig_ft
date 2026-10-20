/**
 * Generated examples and practice questions on the page (contract 0.4.0).
 * One bucket per topic + concept + kind + language, kept for the session so
 * switching structures does not lose what the teacher already fetched.
 * v0.9.1: the server remembers what each teacher got — a card first shows
 * those again (`loadSeen`, no model call), and every «Ещё» click brings ONE
 * item: an unseen one from the shared pool, or a newly generated one only when
 * the teacher has seen the whole pool. A report hides the item at once.
 */
import { create } from 'zustand';
import type { GenerateKind, GeneratedExample, GeneratedQuizItem, GeneratedReportReason } from '@bilig/content-model/api';
import type { Lang } from '@bilig/content-model';
import { isApiError } from '../api/client';
import { generateMore, loadGeneratedSeen, sendGeneratedFeedback } from '../api/tutor';

export type GeneratedItem = GeneratedExample | GeneratedQuizItem;
export type Vote = 'good' | 'bad';

interface Bucket {
  items: GeneratedItem[];
  exhausted: boolean;
  loading: boolean;
  errorKey?: string;
  /** The teacher's earlier items were requested (once per bucket and session). */
  seenLoaded?: boolean;
}

interface Store {
  buckets: Record<string, Bucket>;
  votes: Record<string, Vote>;
}

export const useGeneratedStore = create<Store>(() => ({ buckets: {}, votes: {} }));

const EMPTY: Bucket = { items: [], exhausted: false, loading: false };
export const bucketKey = (topicKey: string, conceptKey: string | undefined, kind: GenerateKind, lang: Lang) => `${topicKey}|${conceptKey ?? ''}|${kind}|${lang}`;

const patch = (key: string, p: Partial<Bucket>) =>
  useGeneratedStore.setState((s) => ({ buckets: { ...s.buckets, [key]: { ...(s.buckets[key] ?? EMPTY), ...p } } }));

export const errorKeyOf = (e: unknown): string =>
  isApiError(e) && e.code === 'rate_limited' ? 'errors.rate_limited' : isApiError(e) && (e.unavailable || e.code === 'tutor_unavailable') ? 'errors.tutor_unavailable' : 'gen.failed';

/** Fetch `count` more items for a bucket. */
export async function loadMore(topicKey: string, conceptKey: string | undefined, kind: GenerateKind, lang: Lang, count = 1): Promise<void> {
  const key = bucketKey(topicKey, conceptKey, kind, lang);
  const cur = useGeneratedStore.getState().buckets[key] ?? EMPTY;
  if (cur.loading) return;
  patch(key, { loading: true, errorKey: undefined });
  try {
    const res = await generateMore({ topicKey, lang, kind, count, exclude: cur.items.map((i) => i.id), ...(conceptKey ? { conceptKey } : {}) });
    const got: GeneratedItem[] = kind === 'quiz' ? res.quiz : res.examples;
    const latest = useGeneratedStore.getState().buckets[key] ?? EMPTY;
    const seen = new Set(latest.items.map((i) => i.id));
    patch(key, { items: [...latest.items, ...got.filter((i) => !seen.has(i.id))], exhausted: res.exhausted, loading: false });
  } catch (e) {
    patch(key, { loading: false, errorKey: errorKeyOf(e) });
  }
}

/** Show again what this teacher already got for the card (best-effort: the card works without it). */
export async function loadSeen(topicKey: string, conceptKey: string | undefined, kind: GenerateKind, lang: Lang): Promise<void> {
  const key = bucketKey(topicKey, conceptKey, kind, lang);
  if ((useGeneratedStore.getState().buckets[key] ?? EMPTY).seenLoaded) return;
  patch(key, { seenLoaded: true });
  try {
    const res = await loadGeneratedSeen({ topicKey, lang, kind, ...(conceptKey ? { conceptKey } : {}) });
    const got: GeneratedItem[] = kind === 'quiz' ? res.quiz : res.examples;
    const latest = useGeneratedStore.getState().buckets[key] ?? EMPTY;
    const have = new Set(latest.items.map((i) => i.id));
    patch(key, { items: [...got.filter((i) => !have.has(i.id)), ...latest.items] });
  } catch {
    /* no history (guest, offline): «Ещё» still works */
  }
}

/** «Хороший пример» or a report. A report removes the item from every bucket immediately. */
export async function vote(id: string, v: Vote, reason?: GeneratedReportReason): Promise<void> {
  useGeneratedStore.setState((s) => ({
    votes: { ...s.votes, [id]: v },
    buckets:
      v === 'bad'
        ? Object.fromEntries(Object.entries(s.buckets).map(([k, b]) => [k, { ...b, items: b.items.filter((i) => i.id !== id) }]))
        : s.buckets,
  }));
  try {
    await sendGeneratedFeedback(id, v === 'good' ? { vote: 'good' } : { vote: 'bad', reason: reason ?? 'wrong' });
  } catch {
    /* feedback is best-effort; the item is already hidden locally */
  }
}

export function useGenerated(topicKey: string, conceptKey: string | undefined, kind: GenerateKind, lang: Lang): Bucket {
  return useGeneratedStore((s) => s.buckets[bucketKey(topicKey, conceptKey, kind, lang)] ?? EMPTY);
}
