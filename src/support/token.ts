/**
 * v0.8.0 support sessions: the client-audience token a staff member works
 * with inside a teacher's cabinet. Held in memory only (never storage), it
 * overrides the client's own token in `src/api/client.ts` while set. The
 * client reports every failed request here, so the support store can turn
 * 403 `support_read_only` / `support_forbidden` into a toast and a 401 into
 * an automatic exit. Dependency-free on purpose: it sits in the initial bundle.
 */
type ProblemListener = (status: number, code: string, detail?: string) => void;

let token: string | null = null;
const listeners = new Set<ProblemListener>();

export const supportAuth = {
  get: (): string | null => token,
  set(next: string | null): void {
    token = next;
  },
  onProblem(l: ProblemListener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Called by the API client for every non-OK answer; ignored outside a support session. */
  report(status: number, code: string, detail?: string): void {
    if (token) listeners.forEach((l) => l(status, code, detail));
  },
};
