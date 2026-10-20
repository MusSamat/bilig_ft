/**
 * What went wrong in the sign-in flows, in the user's words. The server answers with
 * RFC 9457 problems; the flows read `code`, `detail`, `retryAfter` and, when the server
 * sends it, `attemptsLeft`.
 */
import type { TFunction } from 'i18next';
import { isApiError } from '../api/client';
import { errorKey } from '../cabinet/format';
import { MIN_PASSWORD } from '../register/password';

export type AuthProblem =
  | { kind: 'offline' }
  | { kind: 'rateLimited'; retryAfter: number }
  | { kind: 'codeInvalid'; attemptsLeft?: number }
  | { kind: 'codeExpired' }
  | { kind: 'tokenExpired' }
  | { kind: 'taken' }
  | { kind: 'weak'; detail: 'too_short' | 'leaked' | 'too_simple' | 'other' }
  | { kind: 'phone' }
  | { kind: 'credentials' }
  | { kind: 'other'; key: string };

const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);

/** Classify an error of a sign-in step. `step` disambiguates a 401 (code vs. token vs. password). */
export function classify(err: unknown, step: 'start' | 'verify' | 'complete' | 'login'): AuthProblem {
  if (!isApiError(err)) return { kind: 'other', key: 'common.error' };
  if (err.offline) return { kind: 'offline' };
  const p = (err.problem ?? {}) as { detail?: string; retryAfter?: number; attemptsLeft?: unknown; triesLeft?: unknown; issues?: { path: (string | number)[] }[] };
  const d = p.detail;
  if (err.code === 'rate_limited' || err.status === 429) return { kind: 'rateLimited', retryAfter: n(p.retryAfter) ?? 60 };
  if (err.status === 409 || err.code === 'conflict') return { kind: 'taken' };
  if (err.code === 'password_weak') {
    return { kind: 'weak', detail: d === 'too_short' || d === 'leaked' || d === 'too_simple' ? d : 'other' };
  }
  if (d === 'code_expired') return { kind: 'codeExpired' };
  if (d === 'token_expired' || d === 'token_invalid' || (step === 'complete' && (err.status === 401 || err.status === 410))) return { kind: 'tokenExpired' };
  if (d === 'code_invalid' || (step === 'verify' && (err.status === 401 || err.code === 'validation_failed'))) {
    return { kind: 'codeInvalid', attemptsLeft: n(p.attemptsLeft) ?? n(p.triesLeft) };
  }
  if (err.code === 'validation_failed' && p.issues?.some((i) => i.path[0] === 'phone')) return { kind: 'phone' };
  if (step === 'login' && err.code === 'invalid_credentials') return { kind: 'credentials' };
  return { kind: 'other', key: errorKey(err) };
}

/** The message for a problem (a rate limit's countdown is shown apart, see RetryLine). */
export function problemText(p: AuthProblem, t: TFunction, opts: { byPhone?: boolean } = {}): string {
  switch (p.kind) {
    case 'offline':
      return t('register.error.offline');
    case 'rateLimited':
      return t('register.error.rateLimited');
    case 'codeInvalid':
      return p.attemptsLeft !== undefined ? t('register.code.wrongLeft', { count: p.attemptsLeft }) : t('register.code.wrong');
    case 'codeExpired':
      return t('register.code.expired');
    case 'tokenExpired':
      return t('register.error.tokenExpired');
    case 'taken':
      return t('register.taken.title');
    case 'weak':
      return t(`register.error.weak.${p.detail}`, { n: MIN_PASSWORD });
    case 'phone':
      return t('register.error.phoneInvalid');
    case 'credentials':
      return opts.byPhone ? t('auth.error.badPhoneLogin') : t('auth.error.badEmailLogin');
    default:
      return t(p.key);
  }
}

