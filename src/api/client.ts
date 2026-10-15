/**
 * Typed API client over the contract route table (TZ §9). Every call goes
 * through `ENDPOINTS[name]`: path params, Accept-Language, bearer token,
 * Idempotency-Key / If-Match where the route requires them, and the response
 * is validated with the route's Zod schema. Errors are RFC 9457 problems.
 */
import type { z } from 'zod';
import {
  API_PREFIX,
  ENDPOINTS,
  HEADERS,
  ProblemSchema,
  buildPath,
  type EndpointName,
  type EndpointResponse,
  type Problem,
} from '@bilig/content-model/api';
import { API_ORIGIN } from '../config';
import i18n from '../i18n';
import { tokens } from './tokens';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly i18nKey: string,
    readonly problem?: Problem,
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
  /** Network unreachable (offline, DNS, CORS) — callers fall back to local data. */
  get offline(): boolean {
    return this.status === 0;
  }
  /** Offline OR the service says it is temporarily unavailable. */
  get unavailable(): boolean {
    return this.status === 0 || this.status === 503;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Absolute URL for an API path or a server-provided URL (manifest packageUrl, filesBaseUrl). */
export function apiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = API_ORIGIN || (typeof location !== 'undefined' ? location.origin : 'http://localhost');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `${API_PREFIX}/${pathOrUrl}`;
  return new URL(path, base).toString();
}

export interface CallOptions {
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string | number;
  signal?: AbortSignal;
  /** Extra headers (e.g. `Accept: text/event-stream`). */
  headers?: Record<string, string>;
  /** Internal: skip the 401 → refresh → retry cycle. */
  noRefresh?: boolean;
}

export function endpointUrl(name: EndpointName, opts: Pick<CallOptions, 'params' | 'query'> = {}): string {
  const def = ENDPOINTS[name];
  const url = new URL(apiUrl(API_PREFIX + buildPath(def.path, opts.params)));
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

export function requestHeaders(name: EndpointName, opts: CallOptions): Headers {
  const def = ENDPOINTS[name] as (typeof ENDPOINTS)[EndpointName] & { idempotent?: boolean; ifMatch?: boolean };
  const h = new Headers({ Accept: 'application/json', [HEADERS.acceptLanguage]: i18n.language || 'ky' });
  if (opts.body !== undefined) h.set('Content-Type', 'application/json');
  const token = tokens.get();
  if (token) h.set(HEADERS.authorization, `Bearer ${token}`);
  if (def.idempotent) {
    if (!opts.idempotencyKey) throw new Error(`${name} requires an Idempotency-Key`);
    h.set(HEADERS.idempotencyKey, opts.idempotencyKey);
  }
  if (def.ifMatch && opts.ifMatch !== undefined) h.set(HEADERS.ifMatch, String(opts.ifMatch));
  for (const [k, v] of Object.entries(opts.headers ?? {})) h.set(k, v);
  return h;
}

export async function problemFrom(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const p = ProblemSchema.safeParse(body);
  if (p.success) return new ApiError(res.status, p.data.code, p.data.i18nKey, p.data);
  const code = res.status === 503 ? 'tutor_unavailable' : res.status === 401 ? 'unauthorized' : res.status === 404 ? 'not_found' : 'internal';
  return new ApiError(res.status, code, `errors.${code}`);
}

/** Low-level fetch with auth refresh; returns the raw Response (used for SSE). */
export async function rawCall(name: EndpointName, opts: CallOptions = {}): Promise<Response> {
  const def = ENDPOINTS[name];
  let res: Response;
  try {
    res = await fetch(endpointUrl(name, opts), {
      method: def.method,
      headers: requestHeaders(name, opts),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'offline', 'errors.offline');
  }
  if (res.status === 401 && !opts.noRefresh && tokens.get() && name !== 'refresh') {
    const refreshed = await tokens.refresh();
    if (refreshed) return rawCall(name, { ...opts, noRefresh: true });
  }
  if (!res.ok) throw await problemFrom(res);
  return res;
}

/** Call a contract endpoint and validate the response with its schema. */
export async function api<N extends EndpointName>(name: N, opts: CallOptions = {}): Promise<EndpointResponse<N>> {
  const res = await rawCall(name, opts);
  const json: unknown = res.status === 204 ? {} : await res.json();
  const parsed = (ENDPOINTS[name].response as z.ZodTypeAny).safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, 'invalid_response', 'errors.invalid_response');
  return parsed.data as EndpointResponse<N>;
}

/** Fetch a server-provided URL (CDN package, files) and validate with a schema. */
export async function fetchJson<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(url), { signal, credentials: 'include' });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'offline', 'errors.offline');
  }
  if (!res.ok) throw await problemFrom(res);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new ApiError(res.status, 'invalid_response', 'errors.invalid_response');
  return parsed.data;
}
