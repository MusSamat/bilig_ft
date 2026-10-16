/**
 * Server state for content (TanStack Query): catalog, topic packages (manifest →
 * immutable package URL, validated with the contract), search.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { validatePackage, type Catalog, type ContentPackage } from '@bilig/content-model';
import type { SearchResponse } from '@bilig/content-model/api';
import { ApiError, api, apiUrl, fetchJson, isApiError } from './client';

export const loadCatalog = (): Promise<Catalog> => api('catalog');

export const useCatalog = () =>
  useQuery({ queryKey: ['catalog'], queryFn: loadCatalog, staleTime: 5 * 60_000 });

export interface LoadedPackage {
  pkg: ContentPackage;
  /** Absolute base URL for `manifest.files[].path`. */
  filesBaseUrl: string;
  source: 'network';
}

function assertPackage(raw: unknown): ContentPackage {
  const res = validatePackage(raw);
  if (!res.ok || !res.data) throw new ApiError(422, 'invalid_package', 'errors.invalid_package');
  return res.data;
}

/** Fetch a topic package: manifest → package URL (CDN, immutable) → validate. */
export async function fetchTopicPackage(key: string, signal?: AbortSignal): Promise<LoadedPackage & { size: number }> {
  const m = await api('topicManifest', { params: { key }, signal });
  const raw = await fetchJson(m.packageUrl, z.unknown(), signal);
  const pkg = assertPackage(raw);
  const size = JSON.stringify(raw).length + m.manifest.files.reduce((n, f) => n + f.size, 0);
  return { pkg, filesBaseUrl: absoluteBase(m.filesBaseUrl), source: 'network', size };
}

export const absoluteBase = (u: string): string => {
  const abs = apiUrl(u);
  return abs.endsWith('/') ? abs : `${abs}/`;
};

export async function loadTopicPackage(key: string, signal?: AbortSignal): Promise<LoadedPackage> {
  const { pkg, filesBaseUrl, source } = await fetchTopicPackage(key, signal);
  return { pkg, filesBaseUrl, source };
}

export const useTopicPackage = (key: string | undefined) =>
  useQuery({
    queryKey: ['package', key],
    queryFn: ({ signal }) => loadTopicPackage(key!, signal),
    enabled: !!key,
    staleTime: 10 * 60_000,
    retry: (n, e) => n < 1 && !(isApiError(e) && [401, 403, 404].includes(e.status)),
  });

export async function searchServer(q: string, lang: string): Promise<SearchResponse> {
  return api('search', { query: { q, lang, limit: 8 } });
}

export const useServerSearch = (q: string, lang: string) =>
  useQuery({
    queryKey: ['search', q, lang],
    queryFn: () => searchServer(q, lang),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
