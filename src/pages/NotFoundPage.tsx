import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';

export function NotFoundPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const openCatalog = useUi((s) => s.openCatalog);
  return (
    <div className="page page--narrow">
      <section className="card stack" aria-labelledby="nf-title">
        <h1 id="nf-title" className="page-title">
          {t('notFound.title')}
        </h1>
        <div className="state">
          <Icon name="search" />
          <span>{t('topic.notFoundHint')}</span>
          <div className="row">
            <Link className="cta" to={`/${lang}`}>
              <Icon name="home" className="sm" />
              {t('notFound.home')}
            </Link>
            <button type="button" className="btn2" onClick={() => openCatalog()}>
              <Icon name="layers" className="sm" />
              {t('header.openCatalog')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
