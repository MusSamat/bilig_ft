/**
 * Workspace aliases shared by vite.config.ts, vitest.config.ts (and mirrored in
 * tsconfig.base.json `paths`). Packages are consumed from source — no build step.
 * Order matters: specific subpaths before the package root.
 */
import { fileURLToPath } from 'node:url';
import type { Alias } from 'vite';

const r = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export const aliases: Alias[] = [
  { find: '@bilig/content-model/api', replacement: r('packages/content-model/src/api/index.ts') },
  {
    find: /^@bilig\/content-model\/fixtures\/(.*)$/,
    replacement: r('packages/content-model/src/fixtures/') + '$1.ts',
  },
  { find: '@bilig/content-model', replacement: r('packages/content-model/src/index.ts') },
  { find: '@bilig/permissions', replacement: r('packages/permissions/src/index.ts') },
  { find: '@bilig/scene-core', replacement: r('packages/scene-core/src/index.ts') },
  { find: '@bilig/scene-kit', replacement: r('packages/scene-kit/src/index.ts') },
  { find: /^@bilig\/(plugin-[a-z0-9-]+)$/, replacement: r('packages/') + '$1/src/index.ts' },
  { find: /^@\//, replacement: r('src/') },
];
