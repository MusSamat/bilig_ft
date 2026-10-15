#!/usr/bin/env node
/**
 * Bundle budget (TZ §10): initial JS ≤ 250 KB gzip. "Initial" = the entry
 * script in dist/index.html plus every chunk it preloads/imports statically.
 * Also fails if dev/test-only mock fixtures leaked into the production build.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const BUDGET = 250 * 1024;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="\/([^"]+\.js)"/g)].map((m) => m[1]);

// Follow static `import … from "./x.js"` edges from the entry chunks.
const seen = new Set();
const queue = [...entries];
while (queue.length) {
  const f = queue.shift();
  if (seen.has(f)) continue;
  seen.add(f);
  const src = readFileSync(join(dist, f), 'utf8');
  for (const m of src.matchAll(/(?:^|[;\n])\s*import\s*(?:[\w${},*\s]+from\s*)?["']\.\/([^"']+\.js)["']/g)) queue.push(`assets/${m[1]}`);
}
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;
const rows = [...seen].map((f) => [f, gz(f)]);
const total = rows.reduce((n, [, s]) => n + s, 0);
for (const [f, s] of rows) console.log(`${(s / 1024).toFixed(1).padStart(8)} KB  ${f}`);
console.log(`${(total / 1024).toFixed(1).padStart(8)} KB  initial JS (gzip), budget ${BUDGET / 1024} KB`);

const assets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
const leaks = assets.filter((f) => /teacher@bilig\.kg|mockServiceWorker|bilig\.mock\.state/.test(readFileSync(join(dist, 'assets', f), 'utf8')));
if (leaks.length) {
  console.error(`Mock/fixture code found in production build: ${leaks.join(', ')}`);
  process.exit(1);
}
if (total > BUDGET) {
  console.error('Initial JS exceeds the budget.');
  process.exit(1);
}
