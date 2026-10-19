/**
 * DEV/TEST-ONLY mock content: a snapshot of the real content packages built by
 * bilig_back (`content/packages/*.json`, `content/catalog.json`), copied into
 * src/mocks/content. Imported only from src/mocks — never bundled in
 * production (see main.tsx and scripts/size-check.mjs).
 */
import {
  CatalogSchema,
  TextbookSchema,
  filterTextbookTopics,
  summarizeTopic,
  validatePackage,
  type Catalog,
  type ContentPackage,
  type Textbook,
} from '@bilig/content-model';
import catalogBase from './content/catalog.json';

const raw = import.meta.glob<unknown>('./content/packages/*.json', { eager: true, import: 'default' });
const rawTextbooks = import.meta.glob<{ textbook: unknown }>('./content/textbooks/*.json', { eager: true, import: 'default' });

/**
 * The mock CDN (`/mock-files`) only draws placeholder images; it has no GLBs.
 * Files it cannot serve are listed as not built yet (size 0), so the viewer
 * uses its procedural scene, as it does for a real package whose asset is pending.
 */
const servable = (path: string) => /\.(webp|png|jpg)$/.test(path);
const withMockFiles = (p: ContentPackage): ContentPackage => ({
  ...p,
  manifest: { ...p.manifest, files: p.manifest.files.map((f) => (servable(f.path) ? f : { ...f, size: 0 })) },
});

export const PACKAGES: ContentPackage[] = Object.values(raw)
  .map((p) => validatePackage(p).data)
  .filter((p): p is ContentPackage => !!p)
  .map(withMockFiles)
  .sort((a, b) => a.topic.key.localeCompare(b.topic.key));

/**
 * Textbooks (`content/src/textbooks/*.json`, contract 0.5.0). Like the server, lessons list
 * published topics only: keys without a mock package are dropped (the lesson shows «скоро»).
 */
export const TEXTBOOKS: Textbook[] = Object.values(rawTextbooks)
  .map((f) => TextbookSchema.parse(f.textbook))
  .map((t) => filterTextbookTopics(t, (key) => PACKAGES.some((p) => p.topic.key === key)))
  .sort((a, b) => a.order - b.order || a.grade - b.grade);

export function buildCatalog(): Catalog {
  return CatalogSchema.parse({
    ...catalogBase,
    textbooks: TEXTBOOKS,
    // Thumbnails as absolute CDN-style URLs (requested in CONTRACT_REQUESTS.md).
    topics: PACKAGES.map((p) => {
      const t = summarizeTopic(p);
      return t.thumb ? { ...t, thumb: `/mock-files/${t.key}/${t.thumb}` } : t;
    }),
  });
}

export const packageByKey = (key: string): ContentPackage | undefined => PACKAGES.find((p) => p.topic.key === key);
