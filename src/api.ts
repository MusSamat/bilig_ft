/**
 * API client. Every request/response shape comes from @bilig/content-model/api
 * (TZ §9) and is validated at the boundary. Offline/unavailable → null, so the
 * caller can fall back (cached packages, offline MiniSearch tutor).
 */
import {
  API_PREFIX,
  CatalogResponseSchema,
  ENDPOINTS,
  TutorAskResponseSchema,
  buildPath,
  type CatalogResponse,
  type TutorAskRequest,
  type TutorAskResponse,
} from '@bilig/content-model/api';
import { validatePackage, type ContentPackage } from '@bilig/content-model';

const BASE = (import.meta.env.VITE_API_URL ?? '') + API_PREFIX;

export async function fetchCatalog(): Promise<CatalogResponse | null> {
  try {
    const res = await fetch(BASE + ENDPOINTS.catalog.path);
    if (!res.ok) return null;
    const parsed = CatalogResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Load a topic's content package (dev stand-in for the CDN URL from the manifest). */
export async function fetchPackage(topicKey: string): Promise<ContentPackage | null> {
  try {
    const res = await fetch(BASE + buildPath(ENDPOINTS.topicPackage.path, { key: topicKey }));
    if (!res.ok) return null;
    const result = validatePackage(await res.json());
    return result.ok && result.data ? result.data : null;
  } catch {
    return null;
  }
}

/** Ask the online tutor in JSON mode. null when unavailable (503/offline) → offline fallback (W-32). */
export async function askTutorOnline(req: TutorAskRequest): Promise<TutorAskResponse | null> {
  try {
    const res = await fetch(BASE + ENDPOINTS.tutorAsk.path, {
      method: ENDPOINTS.tutorAsk.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    const parsed = TutorAskResponseSchema.safeParse(await res.json());
    return parsed.success && parsed.data.answer.trim() ? parsed.data : null;
  } catch {
    return null;
  }
}
