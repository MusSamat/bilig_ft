/**
 * API client with offline fallback (TZ: offline-first). When the network is
 * down (or the dev backend isn't running) the catalog and the bundled MVP topic
 * package come from @bilig/content-model fixtures, so the app still works — the
 * same package the PWA caches for offline use.
 */
import type { Catalog, ContentPackage } from '@bilig/content-model';
import { animalCellPackage } from '@bilig/content-model/fixtures/animal-cell';

const BASE = import.meta.env.VITE_API_URL ?? '';

function fallbackCatalog(): Catalog {
  return {
    groups: [
      { id: 'natural', title: { ky: 'Табигый', ru: 'Естественные', en: 'Natural' }, order: 0 },
      { id: 'exact', title: { ky: 'Так илимдер', ru: 'Точные', en: 'Exact' }, order: 1 },
      { id: 'earth-space', title: { ky: 'Жер жана космос', ru: 'Земля и космос', en: 'Earth & Space' }, order: 2 },
    ],
    subjects: [animalCellPackage.subject],
  };
}

export async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(`${BASE}/api/catalog`);
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    return (await res.json()) as Catalog;
  } catch {
    return fallbackCatalog();
  }
}

export async function fetchPackage(slug: string): Promise<ContentPackage | null> {
  try {
    const res = await fetch(`${BASE}/api/packages/${encodeURIComponent(slug)}`);
    if (res.status === 404) {
      return slug === animalCellPackage.subject.slug ? animalCellPackage : null;
    }
    if (!res.ok) throw new Error(`package ${res.status}`);
    return (await res.json()) as ContentPackage;
  } catch {
    // Offline: serve the bundled package if it matches.
    return slug === animalCellPackage.subject.slug ? animalCellPackage : null;
  }
}

export interface TutorRequest {
  question: string;
  lang: string;
  topicTitle?: string;
  conceptTitle?: string;
  context?: string;
}

/** Ask the online tutor. Returns null when unavailable (503/offline) so the
 *  caller falls back to the local MiniSearch index (TZ W-32). */
export async function askTutorOnline(req: TutorRequest): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { answer?: string };
    return data.answer?.trim() || null;
  } catch {
    return null;
  }
}
