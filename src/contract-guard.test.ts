/** Guard: app code must never import test-only content fixtures. */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });

describe('app code', () => {
  it('does not import @bilig/content-model fixtures', () => {
    const offenders = files(root).filter((f) => /content-model\/(src\/)?fixtures/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
