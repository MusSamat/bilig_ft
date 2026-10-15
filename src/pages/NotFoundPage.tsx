import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang } from '../lib/hooks';

export function NotFoundPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <div className="page narrow">
      <h1>{t('notFound.title')}</h1>
      <Link className="btn btn--primary" to={`/${lang}`}>
        {t('notFound.home')}
      </Link>
    </div>
  );
}
