/**
 * Test-only: loads the real content packages from the sibling backend repo
 * (`../bilig_back/content/packages`) so plugin tests can check every topic's
 * scene params and node bindings. Returns [] when the directory is absent.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { topicConcepts, type ContentPackage, type ResolvedConcept } from '@bilig/content-model';

export const REAL_PACKAGES_DIR = fileURLToPath(new URL('../../../../bilig_back/content/packages', import.meta.url));

export interface RealTopic {
  file: string;
  pkg: ContentPackage;
  concepts: ResolvedConcept[];
}

export function realTopics(plugin?: string): RealTopic[] {
  if (!existsSync(REAL_PACKAGES_DIR)) return [];
  return readdirSync(REAL_PACKAGES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const pkg = JSON.parse(readFileSync(join(REAL_PACKAGES_DIR, file), 'utf8')) as ContentPackage;
      return { file, pkg, concepts: topicConcepts(pkg) };
    })
    .filter((t) => !plugin || t.pkg.topic.scene.plugin === plugin);
}
