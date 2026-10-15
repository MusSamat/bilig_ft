/** Breadcrumbs (TZ W-04): subject → course → unit → topic, any depth, from the course tree. */
import { useTranslation } from 'react-i18next';
import { t as tr, type Catalog } from '@bilig/content-model';
import { breadcrumbs, type Crumb } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

export function Breadcrumbs({ catalog, topicKey, fallback }: { catalog: Catalog | undefined; topicKey: string; fallback: Crumb[] }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const openCatalog = useUi((s) => s.openCatalog);
  const fromCatalog = catalog ? breadcrumbs(catalog, topicKey) : [];
  const crumbs = fromCatalog.length ? fromCatalog : fallback;
  return (
    <nav className="crumbs" aria-label={t('a11y.breadcrumbs')}>
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.kind}:${c.key}`}>
              {i > 0 && <Icon name="chevron-right" size={14} />}
              {last ? (
                <span aria-current="page">{tr(c.title, lang)}</span>
              ) : (
                <a href="#catalog" onClick={(e) => { e.preventDefault(); openCatalog(); }}>
                  {tr(c.title, lang)}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
