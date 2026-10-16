import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@bilig/content-model/api';
import i18next from 'i18next';
import { ADMIN_NS, registerAdminI18n } from './i18n';
import { EXTRA_ENUMS, FORM_SCHEMAS, schemaKeys } from './forms/schema-keys';
import ky from './locales/ky.json';
import ru from './locales/ru.json';

const flat = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [p];

describe('admin locales', () => {
  it('ru and ky have exactly the same keys', () => {
    const r = new Set(flat(ru));
    const k = new Set(flat(ky));
    expect([...r].filter((x) => !k.has(x))).toEqual([]);
    expect([...k].filter((x) => !r.has(x))).toEqual([]);
  });

  it('no empty strings', () => {
    const empty = (o: unknown, p = ''): string[] =>
      o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => empty(v, `${p}.${k}`)) : o === '' ? [p] : [];
    expect([...empty(ru), ...empty(ky)]).toEqual([]);
  });

  it('every generated-form field and enum value has a label in both languages', () => {
    const acc = { fields: new Set<string>(), enums: new Set<string>(EXTRA_ENUMS) };
    for (const s of FORM_SCHEMAS) schemaKeys(s, acc);
    for (const loc of [ru, ky] as unknown as Record<string, Record<string, string>>[]) {
      expect([...acc.fields].filter((f) => !loc.fields[f]).sort()).toEqual([]);
      expect([...acc.enums].filter((e) => !loc.enum[e]).sort()).toEqual([]);
    }
  });

  it('every problem code is localized', () => {
    for (const loc of [ru, ky] as unknown as Record<string, Record<string, string>>[]) {
      expect(ERROR_CODES.filter((c) => !loc.errors[c])).toEqual([]);
    }
  });

  it('registers the admin namespace on a host i18next instance without changing its language', async () => {
    const host = i18next.createInstance();
    await host.init({ lng: 'en', resources: { en: { app: { hi: 'hi' } } } });
    registerAdminI18n(host);
    registerAdminI18n(host); // idempotent
    expect(host.language).toBe('en');
    expect(host.getFixedT('ky', ADMIN_NS)('nav.topics')).toBe(ky.nav.topics);
    expect(host.getFixedT('ru', ADMIN_NS)('nav.topics')).toBe(ru.nav.topics);
  });
});
