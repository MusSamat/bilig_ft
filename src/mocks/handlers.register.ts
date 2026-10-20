/**
 * DEV/TEST-ONLY MSW handlers for contract 0.6.0 teacher self-registration:
 * POST /auth/register → the e-mail code (fixed `REGISTER_CODE`, like the server's
 * AUTH_FIXED_OTP) → POST /auth/register/verify signs in; POST /auth/register/resend.
 * Same answer whether or not the e-mail is taken; 5 wrong tries burn the code.
 *
 * v0.7.0 phone-first accounts: POST /auth/otp/start (WhatsApp code, the same fixed
 * code) → /auth/otp/verify (single-use token) → /auth/register/complete or
 * /auth/password/set (both sign in). A correct code for an already registered number
 * (purpose register) answers 409 — only the number's owner can learn that.
 */
import type { HttpHandler } from 'msw';
import { formatKgPhone, type EndpointBody } from '@bilig/content-model/api';
import { REGISTER_CODE, mockDb, newId, type MockUser } from './db';

/** Wired into `handlers` (they need `route`/`fail`/`tokenFor` from there). */
export interface RegisterDeps {
  route: typeof import('./handlers').route;
  fail: typeof import('./handlers').fail;
  tokenFor: (u: MockUser) => { accessToken: string; tokenType: 'Bearer'; expiresIn: number };
}

export const CODE_TTL_S = 15 * 60;
export const RESEND_AFTER_S = 60;
export const MAX_CODE_ATTEMPTS = 5;
export const TRIAL_DAYS = 30;
/** A few entries of the server's leaked-password list. */
const LEAKED = new Set(['password123', 'qwerty12345', '1234567890', '1q2w3e4r5t', 'qwertyuiop']);

const sent = () => ({ ok: true as const, expiresIn: CODE_TTL_S, resendAfter: RESEND_AFTER_S });

/** v0.7.0 WhatsApp codes: 10 minutes; tokens: 15 minutes. */
export const OTP_TTL_S = 10 * 60;
export const OTP_TOKEN_TTL_S = 15 * 60;

function weakPassword(password: string): 'leaked' | 'too_simple' | null {
  if (LEAKED.has(password.toLowerCase())) return 'leaked';
  if (new Set(password.toLowerCase()).size <= 2) return 'too_simple';
  return null;
}

const randomToken = (): string => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 12)).join('').padEnd(32, '0');

export function registerHandlers({ route, fail, tokenFor }: RegisterDeps): HttpHandler[] {
  type Extra = Parameters<typeof fail>[1];
  const badToken = () => fail('invalid_credentials', { detail: 'token_expired' });
  const takeToken = (token: string, purpose: 'register' | 'reset') => {
    const rec = mockDb.otpTokens[token];
    delete mockDb.otpTokens[token]; // single use
    return rec && rec.purpose === purpose && rec.expiresAt > Date.now() ? rec : null;
  };

  return [
    route('otpStart', ({ body }) => {
      const b = body as EndpointBody<'otpStart'>;
      const key = `${b.purpose}:${b.phone}`;
      const prev = mockDb.otps[key];
      const wait = prev ? Math.ceil((prev.sentAt + RESEND_AFTER_S * 1000 - Date.now()) / 1000) : 0;
      if (wait > 0) return fail('rate_limited', { detail: 'resend_too_soon', retryAfter: wait });
      const hasAccount = mockDb.users.some((u) => u.phone === b.phone);
      const now = Date.now();
      mockDb.otps[key] = {
        phone: b.phone,
        purpose: b.purpose,
        noAccountMatch: b.purpose === 'register' ? hasAccount : !hasAccount,
        attempts: 0,
        sentAt: now,
        expiresAt: now + OTP_TTL_S * 1000,
      };
      return { ok: true as const, channel: 'whatsapp' as const, expiresIn: OTP_TTL_S, resendAfter: RESEND_AFTER_S };
    }),

    route('otpVerify', ({ body }) => {
      const b = body as EndpointBody<'otpVerify'>;
      const key = `${b.purpose}:${b.phone}`;
      const rec = mockDb.otps[key];
      if (!rec) return fail('invalid_credentials', { detail: 'code_invalid' });
      if (rec.attempts >= MAX_CODE_ATTEMPTS || Date.now() > rec.expiresAt) return fail('invalid_credentials', { detail: 'code_expired' });
      if (b.code !== REGISTER_CODE || (rec.purpose === 'reset' && rec.noAccountMatch)) {
        rec.attempts += 1;
        const attemptsLeft = MAX_CODE_ATTEMPTS - rec.attempts;
        return attemptsLeft <= 0
          ? fail('invalid_credentials', { detail: 'code_expired' })
          : fail('invalid_credentials', { detail: 'code_invalid', attemptsLeft } as Extra);
      }
      delete mockDb.otps[key];
      if (rec.purpose === 'register' && rec.noAccountMatch) return fail('conflict', { detail: 'phone_registered' });
      const token = randomToken();
      mockDb.otpTokens[token] = { phone: rec.phone, purpose: rec.purpose, expiresAt: Date.now() + OTP_TOKEN_TTL_S * 1000 };
      return { token, expiresIn: OTP_TOKEN_TTL_S };
    }),

    route('registerComplete', ({ body }) => {
      const b = body as EndpointBody<'registerComplete'>;
      const weak = weakPassword(b.password);
      if (weak) return fail('password_weak', { detail: weak, i18nKey: `errors.password_weak.${weak}` });
      const rec = takeToken(b.token, 'register');
      if (!rec) return badToken();
      if (mockDb.users.some((u) => u.phone === rec.phone)) return fail('conflict', { detail: 'phone_registered' });
      const schoolId = newId();
      const user: MockUser = {
        id: newId(),
        kind: 'adult',
        displayName: formatKgPhone(rec.phone),
        phone: rec.phone,
        password: b.password,
        locale: 'ky',
        grants: [{ role: 'teacher', scope: 'school', scopeId: schoolId }],
        selfRegistered: true,
      };
      mockDb.users.push(user);
      const now = Date.now();
      mockDb.licenses.push({
        schoolId,
        schoolName: user.displayName,
        subjects: [],
        grades: [],
        startsAt: new Date(now).toISOString(),
        endsAt: new Date(now + TRIAL_DAYS * 86400_000).toISOString(),
        trial: true,
      });
      return tokenFor(user);
    }),

    route('passwordSet', ({ body }) => {
      const b = body as EndpointBody<'passwordSet'>;
      const weak = weakPassword(b.password);
      if (weak) return fail('password_weak', { detail: weak, i18nKey: `errors.password_weak.${weak}` });
      const rec = takeToken(b.token, 'reset');
      const user = rec && mockDb.users.find((u) => u.phone === rec.phone);
      if (!user) return badToken();
      user.password = b.password;
      for (const [tok, id] of Object.entries(mockDb.tokens)) if (id === user.id) delete mockDb.tokens[tok]; // other sessions end
      return tokenFor(user);
    }),

    route('register', ({ body }) => {
      const b = body as EndpointBody<'register'>;
      const email = b.email.toLowerCase();
      if (LEAKED.has(b.password.toLowerCase())) return fail('password_weak', { detail: 'leaked', i18nKey: 'errors.password_weak.leaked' });
      if (new Set(b.password.toLowerCase()).size <= 2) return fail('password_weak', { detail: 'too_simple', i18nKey: 'errors.password_weak.too_simple' });
      const existing = mockDb.users.some((u) => u.email === email);
      const now = Date.now();
      mockDb.registrations[email] = {
        email,
        displayName: b.displayName,
        password: b.password,
        locale: b.locale ?? 'ky',
        teaching: b.teaching,
        schoolName: b.schoolName,
        region: b.region,
        existing,
        attempts: 0,
        sentAt: now,
        expiresAt: now + CODE_TTL_S * 1000,
      };
      return sent();
    }),

    route('registerResend', ({ body }) => {
      const email = (body as EndpointBody<'registerResend'>).email.toLowerCase();
      const rec = mockDb.registrations[email];
      if (!rec) return sent(); // no enumeration
      const wait = Math.ceil((rec.sentAt + RESEND_AFTER_S * 1000 - Date.now()) / 1000);
      if (wait > 0) return fail('rate_limited', { retryAfter: wait });
      rec.attempts = 0;
      rec.sentAt = Date.now();
      rec.expiresAt = rec.sentAt + CODE_TTL_S * 1000;
      return sent();
    }),

    route('registerVerify', ({ body }) => {
      const b = body as EndpointBody<'registerVerify'>;
      const rec = mockDb.registrations[b.email.toLowerCase()];
      if (!rec || rec.existing) {
        if (rec) rec.attempts += 1;
        return fail('invalid_credentials', { detail: 'code_invalid' });
      }
      if (rec.attempts >= MAX_CODE_ATTEMPTS || Date.now() > rec.expiresAt) return fail('invalid_credentials', { detail: 'code_expired' });
      if (b.code !== REGISTER_CODE) {
        rec.attempts += 1;
        return fail('invalid_credentials', { detail: rec.attempts >= MAX_CODE_ATTEMPTS ? 'code_expired' : 'code_invalid' });
      }
      delete mockDb.registrations[rec.email];
      const schoolId = newId();
      const user: MockUser = {
        id: newId(),
        kind: 'adult',
        displayName: rec.displayName,
        email: rec.email,
        password: rec.password,
        locale: rec.locale,
        grants: [{ role: 'teacher', scope: 'school', scopeId: schoolId }],
        ...(rec.teaching ? { teaching: rec.teaching } : {}),
      };
      mockDb.users.push(user);
      if (rec.teaching) {
        const now = Date.now();
        mockDb.licenses.push({
          schoolId,
          schoolName: rec.schoolName ?? rec.displayName,
          subjects: rec.teaching.subjects,
          grades: rec.teaching.grades,
          startsAt: new Date(now).toISOString(),
          endsAt: new Date(now + TRIAL_DAYS * 86400_000).toISOString(),
          trial: true,
        });
      }
      return tokenFor(user);
    }),
  ];
}
