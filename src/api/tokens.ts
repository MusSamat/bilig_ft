/**
 * Access token kept ONLY in memory (TZ §6: JWT 15 min «в памяти клиента»);
 * the refresh token lives in an HttpOnly cookie the browser sends to
 * POST /auth/refresh. Concurrent refreshes are de-duplicated.
 */
type Listener = (token: string | null) => void;

let accessToken: string | null = null;
let expiresAt = 0;
let inflight: Promise<boolean> | null = null;
let refresher: (() => Promise<{ accessToken: string; expiresIn: number } | null>) | null = null;
const listeners = new Set<Listener>();

export const tokens = {
  get: (): string | null => accessToken,
  set(token: string | null, expiresIn = 900): void {
    accessToken = token;
    expiresAt = token ? Date.now() + expiresIn * 1000 : 0;
    listeners.forEach((l) => l(token));
  },
  /** Seconds left before the access token expires (0 when none). */
  ttl: (): number => Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setRefresher(fn: typeof refresher): void {
    refresher = fn;
  },
  /** Exchange the refresh cookie for a new access token. Resolves false when there is no session. */
  refresh(): Promise<boolean> {
    if (!refresher) return Promise.resolve(false);
    inflight ??= refresher()
      .then((r) => {
        tokens.set(r?.accessToken ?? null, r?.expiresIn);
        return !!r;
      })
      .catch(() => false)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
};
