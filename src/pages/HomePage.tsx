/** Landing page: hero + the subject catalog (TZ W-02). */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { CatalogModal } from '../components/CatalogModal';
import { applyTheme, NEUTRAL_HUE } from '../theme';
import { useStore } from '../store';

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  const theme = useStore((s) => s.theme);
  const [catalogOpen, setCatalogOpen] = useState(true);

  useEffect(() => {
    applyTheme(NEUTRAL_HUE, theme);
  }, [theme]);

  return (
    <div className="app">
      <Header onOpenCatalog={() => setCatalogOpen(true)} />
      {catalogOpen && <CatalogModal onClose={() => setCatalogOpen(false)} />}
      <main className="hero">
        <h1 className="hero__title">Bilig</h1>
        <p className="hero__tagline">{t('app.tagline')}</p>
        <button className="btn btn--accent btn--lg" onClick={() => setCatalogOpen(true)}>
          {t('home.openCatalog')}
        </button>
      </main>
    </div>
  );
}
