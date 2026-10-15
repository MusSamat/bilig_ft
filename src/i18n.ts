/**
 * UI localization. Only interface strings live in `src/locales/<lang>/<ns>.json`;
 * CONTENT (subjects, topics, concepts) is localized inside content packages via
 * the content-model `Localized` type. Plurals use i18next's Intl.PluralRules
 * suffixes (`_one`, `_few`, `_many`, `_other`), numbers/dates use Intl.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANG, FALLBACK_CHAIN, type Lang } from '@bilig/content-model';
import { UI_LANGS, isUiLang } from './config';

type Tree = Record<string, unknown>;
const files = import.meta.glob<Tree>('./locales/*/*.json', { eager: true, import: 'default' });

/** `{ [lang]: { translation: { [ns]: {...} } } }` built from the locale folders. */
export function buildResources(): Record<string, { translation: Tree }> {
  const out: Record<string, { translation: Tree }> = {};
  for (const [path, data] of Object.entries(files)) {
    const [, , lang, file] = path.split('/');
    const ns = file.replace(/\.json$/, '');
    (out[lang] ??= { translation: {} }).translation[ns] = data;
  }
  return out;
}

/** Language from the URL (`/:lang/...`), then storage, then the browser, then the default. */
export function detectLang(): Lang {
  const fromPath = typeof location !== 'undefined' ? location.pathname.split('/')[1] : '';
  if (isUiLang(fromPath)) return fromPath;
  try {
    const stored = localStorage.getItem('bilig.lang');
    if (isUiLang(stored)) return stored;
  } catch {
    /* storage blocked */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '';
  return isUiLang(nav) ? nav : DEFAULT_LANG;
}

void i18n.use(initReactI18next).init({
  resources: buildResources(),
  lng: detectLang(),
  supportedLngs: [...UI_LANGS],
  fallbackLng: FALLBACK_CHAIN.filter((l) => UI_LANGS.includes(l)),
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
