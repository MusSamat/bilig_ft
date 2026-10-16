/**
 * i18n checks (TZ §10 «ни одной захардкоженной строки», W-01 «новый язык =
 * новые файлы локалей»): equal key sets in every language (plural suffixes
 * normalised, each language has the plural categories Intl.PluralRules needs),
 * every statically used key exists, every scene mode has a label key, and
 * src has no Cyrillic/Latin literal UI strings outside the locale files.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSIONS } from '@bilig/permissions';
import { UNIVERSAL_MODES } from '@bilig/scene-core';
import { GLTF_MODES } from '@bilig/plugin-gltf';
import { MOLECULE_MODES } from '@bilig/plugin-molecule';
import { CRYSTAL_MODES } from '@bilig/plugin-crystal';
import { GEOMETRY_MODES } from '@bilig/plugin-geometry';
import { SIM_MODES } from '@bilig/plugin-sim';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const LOCALES = join(SRC, 'locales');
const LANGS = readdirSync(LOCALES).filter((d) => statSync(join(LOCALES, d)).isDirectory());
const PLURAL = /_(zero|one|two|few|many|other)$/;

type Tree = { [k: string]: string | Tree };
const flatten = (o: Tree, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : flatten(v, `${prefix}${k}.`)));

function keysOf(lang: string): string[] {
  return readdirSync(join(LOCALES, lang))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => flatten(JSON.parse(readFileSync(join(LOCALES, lang, f), 'utf8')) as Tree, `${f.replace(/\.json$/, '')}.`));
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'locales' || f === 'mocks' || f === 'test' || f === 'admin' ? [] : files(p); // admin has its own i18n test
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !/testUtils/.test(f) ? [p] : [];
  });

/** Remove comments (keeps string contents intact well enough for this lint). */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('locales', () => {
  const base = new Set(keysOf(LANGS[0]).map((k) => k.replace(PLURAL, '')));

  it('has the three MVP languages', () => {
    expect(LANGS.sort()).toEqual(['en', 'ky', 'ru']);
  });

  it.each(LANGS)('%s has exactly the same keys (plurals normalised)', (lang) => {
    const keys = new Set(keysOf(lang).map((k) => k.replace(PLURAL, '')));
    expect([...keys].filter((k) => !base.has(k)), 'extra').toEqual([]);
    expect([...base].filter((k) => !keys.has(k)), 'missing').toEqual([]);
  });

  it.each(LANGS)('%s has every plural category its Intl.PluralRules uses', (lang) => {
    const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    const keys = keysOf(lang);
    const plurals = [...new Set(keys.filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')))];
    const missing = plurals.flatMap((p) => cats.filter((c) => !keys.includes(`${p}_${c}`)).map((c) => `${p}_${c}`));
    expect(missing).toEqual([]);
  });

  it('has no empty strings', () => {
    for (const lang of LANGS) {
      for (const f of readdirSync(join(LOCALES, lang))) {
        const raw = readFileSync(join(LOCALES, lang, f), 'utf8');
        expect(raw.includes('""'), `${lang}/${f}`).toBe(false);
      }
    }
  });

  it('every scene mode id has a mode.<id> label key', () => {
    const ids = [...UNIVERSAL_MODES, ...GLTF_MODES, ...MOLECULE_MODES, ...CRYSTAL_MODES, ...GEOMETRY_MODES, ...SIM_MODES].map((m) => `mode.${m.id}`);
    expect(ids.filter((k) => !base.has(k))).toEqual([]);
  });

  it('every statically referenced key exists', () => {
    const namespaces = new Set(readdirSync(join(LOCALES, LANGS[0])).map((f) => f.replace(/\.json$/, '')));
    const missing: string[] = [];
    for (const f of files(SRC)) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/['"]([a-zA-Z]+\.[a-zA-Z0-9_.]+)['"]/g)) {
        const key = m[1];
        if (!namespaces.has(key.split('.')[0]) || /\.(json|ts|tsx|css|js)$/.test(key) || (PERMISSIONS as readonly string[]).includes(key)) continue;
        if (!base.has(key)) missing.push(`${relative(SRC, f)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('no hard-coded UI strings in src', () => {
  const offenders: string[] = [];
  for (const f of files(SRC)) {
    const rel = relative(SRC, f);
    const src = stripComments(readFileSync(f, 'utf8'));
    // Cyrillic anywhere in code (comments stripped) is UI text that belongs in locales.
    for (const m of src.matchAll(/[Ѐ-ӿ]+/g)) offenders.push(`${rel}: cyrillic «${m[0]}»`);
    if (!f.endsWith('.tsx')) continue;
    // JSX text nodes with letters.
    for (const m of src.matchAll(/>\s*([\p{L}][^<>{}=;()&|]*?)\s*</gu)) {
      if (/^[A-Za-z]+$/.test(m[1]) && m[0].endsWith(`${m[1]}<`)) continue; // TS generic like `Promise<…>`
      offenders.push(`${rel}: text «${m[1].trim()}»`);
    }
    // Literal accessible names / placeholders.
    for (const m of src.matchAll(/\b(aria-label|title|placeholder|alt|label)="([^"]*\p{L}[^"]*)"/gu)) offenders.push(`${rel}: ${m[1]}="${m[2]}"`);
  }
  it('finds none', () => {
    expect(offenders).toEqual([]);
  });
});
