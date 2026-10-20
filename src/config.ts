/**
 * App configuration. The UI language list is derived from the locale folders
 * (`src/locales/<lang>/`), so a new language = new locale files (TZ W-01).
 */
import { DEFAULT_LANG, isLang, type Lang } from '@bilig/content-model';

const localeFolders = Object.keys(import.meta.glob('./locales/*/app.json', { eager: true }))
  .map((p) => p.split('/')[2])
  .filter(isLang);

/** Display order: default language first, then the rest as configured. */
export const UI_LANGS: readonly Lang[] = [
  ...localeFolders.filter((l) => l === DEFAULT_LANG),
  ...localeFolders.filter((l) => l !== DEFAULT_LANG).sort(),
];

/** Header language switch order (Workbench: RU · KY · EN), then any other locale folder. */
const HEADER_ORDER: readonly string[] = ['ru', 'ky', 'en'];
export const HEADER_LANGS: readonly Lang[] = [
  ...HEADER_ORDER.filter((l): l is Lang => (UI_LANGS as readonly string[]).includes(l)),
  ...UI_LANGS.filter((l) => !HEADER_ORDER.includes(l)),
];

export const isUiLang = (v: unknown): v is Lang => typeof v === 'string' && (UI_LANGS as readonly string[]).includes(v);

/** API origin + prefix; empty origin = same origin (dev proxy /api → :3000). */
export const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/** Mock API (MSW) is enabled only in dev with VITE_MOCK=1 — never in production builds. */
export const MOCK_API = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1';

/** Offline trust window for the last known session (TZ §6: «до 7 дней»). */
export const OFFLINE_SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

/** Guest assistant questions per session before asking to sign in (TZ §2 «лимит»). */
export const GUEST_TUTOR_LIMIT = 10;

/** KTX2 transcoder location (copied by vite.config.ts). */
export const KTX2_TRANSCODER_PATH = '/basis/';

/**
 * v0.7.0: the student sign-in (class code → name → PIN) stays in the API and in the
 * code, but the login page shows only the teacher/staff form for now. Off unless a
 * build sets VITE_SHOW_STUDENT_LOGIN=1 (the e2e mock server does, for the student scenario).
 */
export const SHOW_STUDENT_LOGIN: boolean = import.meta.env.VITE_SHOW_STUDENT_LOGIN === '1';
