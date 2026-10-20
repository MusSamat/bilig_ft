/**
 * Layout for every `/:lang/*` route: keeps i18next, `<html lang>`, the title
 * and the manifest in sync with the URL language (W-05: the URL is the source
 * of truth), applies hue tokens (W-03), hotkeys for the catalog (W-02), and
 * hosts the catalog sheet, the slides dialog and the toasts.
 */
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANG } from '@bilig/content-model';
import { isUiLang } from '../config';
import { applyTheme } from '../lib/theme';
import { useKeydown } from '../lib/hooks';
import { switchLangPath } from '../lib/urls';
import { useUi } from '../state/ui';
import { SupportBanner } from '../support/SupportBanner';
import { useSupport } from '../support/store';
import { CatalogModal } from './CatalogModal';
import { Header } from './Header';
import { IconSprite } from './Icon';
import { Toasts } from './Toasts';


export function Shell(): JSX.Element {
  const { lang } = useParams();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const hue = useUi((s) => s.hue);
  const theme = useUi((s) => s.theme);
  const openCatalog = useUi((s) => s.openCatalog);
  const catalogOpen = useUi((s) => s.catalogOpen);
  const valid = isUiLang(lang);
  // v0.8.0: a staff member in a teacher's cabinet — the support banner sticks above the header.
  const inSupport = useSupport((s) => !!s.active);

  useEffect(() => {
    if (!valid) return;
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('bilig.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang, valid, i18n]);

  useEffect(() => {
    if (valid) document.title = `${t('app.title')} — ${t('app.tagline')}`;
  }, [valid, t, i18n.language]);

  useEffect(() => applyTheme(hue, theme), [hue, theme]);

  // `--hdr-h`: the sticky header's height, so sticky columns and the 3D view sit right below it.
  useEffect(() => {
    const top = document.querySelector<HTMLElement>('.top');
    if (!top || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--hdr-h', `${top.offsetHeight}px`));
    ro.observe(top);
    return () => ro.disconnect();
  }, [valid]);

  // W-02 hotkeys: `/` and Ctrl/⌘+K open the catalog.
  useKeydown((e) => {
    if (catalogOpen) return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openCatalog();
    }
  });

  if (!valid) return <Navigate to={switchLangPath(location.pathname.replace(/^\/[^/]*/, ''), location.search, '', DEFAULT_LANG)} replace />;

  return (
    <div className="app">
      <IconSprite />
      <a className="skip-link" href="#main">
        {t('a11y.skip')}
      </a>
      {inSupport ? (
        <div className="sticky top-0 z-15">
          <SupportBanner />
          <Header />
        </div>
      ) : (
        <Header />
      )}
      <CatalogModal />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="foot">
        {t('app.title')} · {t('app.tagline')}
      </footer>
      <Toasts />
    </div>
  );
}
