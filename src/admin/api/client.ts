/**
 * Typed admin API client over the shared route table (`ENDPOINTS`, `/api/v1`).
 *
 *  - every request body and query is parsed with the endpoint's Zod schema
 *    before it leaves the browser, and every JSON response is parsed with the
 *    response schema (a mismatch is a `ContractError`, never silent);
 *  - every call carries `X-Bilig-Audience: admin` (TZ §6: the admin token has
 *    its own audience; a client token does not work here);
 *  - the access token lives in memory only; on 401 the client refreshes once
 *    through the HttpOnly `bilig_admin_rt` cookie and retries;
 *  - versioned writes send `If-Match: "<version>"` (409 → `ApiError` with
 *    code `version_mismatch`, handled by the conflict UI); for endpoints with
 *    `ifMatchOptional` (schools, licences) it is sent whenever a version is known.
 */
import type { z } from 'zod';
import {
  API_PREFIX,
  ENDPOINTS,
  HEADERS,
  ProblemSchema,
  TokenResponseSchema,
  buildPath,
  problem,
  type EndpointName,
  type Problem,
} from '@bilig/content-model/api';

type Def<N extends EndpointName> = (typeof ENDPOINTS)[N];
export type BodyIn<N extends EndpointName> = Def<N> extends { body: infer B extends z.ZodTypeAny } ? z.input<B> : never;
export type QueryIn<N extends EndpointName> = Def<N> extends { query: infer Q extends z.ZodTypeAny } ? z.input<Q> : never;
export type Resp<N extends EndpointName> = z.infer<Def<N>['response']>;

export interface CallOpts<N extends EndpointName> {
  params?: Record<string, string>;
  query?: QueryIn<N>;
  body?: BodyIn<N>;
  /** Entity version for If-Match (required when the endpoint declares `ifMatch`, sent when given for `ifMatchOptional`). */
  ifMatch?: number;
  /** Use this bearer token instead of the stored admin token. */
  token?: string;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
    readonly endpoint: EndpointName | 'refresh',
  ) {
    super(problem?.detail ?? problem?.code ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
  get code(): string {
    return this.problem?.code ?? (this.status === 0 ? 'network' : 'internal');
  }
  get detail(): string | undefined {
    return this.problem?.detail;
  }
}

/** The server answered something the contract does not allow (or we tried to send it). */
export class ContractError extends Error {
  constructor(
    readonly endpoint: EndpointName,
    readonly where: 'body' | 'query' | 'response',
    readonly issues: z.ZodIssue[],
  ) {
    super(`${endpoint}: ${where} does not match the contract`);
    this.name = 'ContractError';
  }
}

/** A client-side validation failure shaped like the server's problem. */
export const validationError = (endpoint: EndpointName, issues: { path: (string | number)[]; message: string }[] = []) =>
  new ApiError(400, problem('validation_failed', { issues }), endpoint);

export const isConflict = (e: unknown): e is ApiError =>
  e instanceof ApiError && (e.code === 'version_mismatch' || (e.status === 409 && e.code === 'conflict'));

export interface ClientConfig {
  getToken(): string | null;
  setToken(token: string | null): void;
  lang(): string;
  /** Called when the session cannot be refreshed (show the login screen). */
  onAuthLost?(): void;
  baseUrl?: string;
}

export interface BinaryResult {
  blob: Blob;
  filename?: string;
}

const NO_REFRESH: ReadonlySet<EndpointName> = new Set(['login', 'refresh', 'logout', 'authTotpEnrollSetup', 'authTotpEnrollVerify']);

function serializeQuery(q: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(cfg: ClientConfig) {
  const base = cfg.baseUrl ?? API_PREFIX;
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const res = await fetch(base + ENDPOINTS.refresh.path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', [HEADERS.audience]: 'admin' },
          body: '{}',
        });
        if (!res.ok) return false;
        const parsed = TokenResponseSchema.safeParse(await res.json());
        if (!parsed.success) return false;
        cfg.setToken(parsed.data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        queueMicrotask(() => (refreshing = null));
      }
    })();
    return refreshing;
  }

  async function send<N extends EndpointName>(name: N, opts: CallOpts<N>, retry: boolean): Promise<Response> {
    const def = ENDPOINTS[name] as unknown as {
      method: string;
      path: string;
      body?: z.ZodTypeAny;
      query?: z.ZodTypeAny;
      ifMatch?: boolean;
      ifMatchOptional?: boolean;
    };
    let url = base + buildPath(def.path, opts.params);
    if (def.query) {
      const q = def.query.safeParse(opts.query ?? {});
      if (!q.success) throw new ContractError(name, 'query', q.error.issues);
      url += serializeQuery(q.data as Record<string, unknown>);
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [HEADERS.audience]: 'admin',
      [HEADERS.acceptLanguage]: cfg.lang(),
    };
    let body: string | undefined;
    if (def.body) {
      const b = def.body.safeParse(opts.body ?? {});
      if (!b.success) throw new ContractError(name, 'body', b.error.issues);
      body = JSON.stringify(b.data);
      headers['Content-Type'] = 'application/json';
    }
    if (def.ifMatch) {
      if (opts.ifMatch === undefined) throw new Error(`${name} requires ifMatch`);
      headers[HEADERS.ifMatch] = `"${opts.ifMatch}"`;
    } else if (def.ifMatchOptional && opts.ifMatch !== undefined) headers[HEADERS.ifMatch] = `"${opts.ifMatch}"`;
    const token = opts.token ?? cfg.getToken();
    if (token) headers[HEADERS.authorization] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(url, { method: def.method, headers, body, credentials: 'include', signal: opts.signal });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new ApiError(0, null, name);
    }
    if (res.status === 401 && retry && !opts.token && !NO_REFRESH.has(name)) {
      if (await refresh()) return send(name, opts, false);
      cfg.setToken(null);
      cfg.onAuthLost?.();
    }
    if (!res.ok) {
      let problem: Problem | null = null;
      try {
        const p = ProblemSchema.safeParse(await res.json());
        if (p.success) problem = p.data;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, problem, name);
    }
    return res;
  }

  /** JSON call: request and response are validated with the contract schemas. */
  async function call<N extends EndpointName>(name: N, opts: CallOpts<N> = {}): Promise<Resp<N>> {
    const res = await send(name, opts, true);
    const data = await res.json();
    const parsed = (ENDPOINTS[name].response as z.ZodTypeAny).safeParse(data);
    if (!parsed.success) throw new ContractError(name, 'response', parsed.error.issues);
    return parsed.data as Resp<N>;
  }

  /** Binary call (CSV / XLIFF / PDF): endpoints that declare `produces`. */
  async function callBinary<N extends EndpointName>(name: N, opts: CallOpts<N> = {}): Promise<BinaryResult> {
    const res = await send(name, opts, true);
    const cd = res.headers.get('Content-Disposition') ?? '';
    const m = /filename="?([^";]+)"?/.exec(cd);
    return { blob: await res.blob(), filename: m?.[1] };
  }

  return { call, callBinary, refresh };
}

export type ApiClient = ReturnType<typeof createApiClient>;
