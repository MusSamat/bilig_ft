/**
 * Breadcrumbs (TZ W-04), Workbench style: the subject icon, then subject ›
 * section › topic in muted text with chevron icons. Any depth is supported;
 * the course level is folded when the topic has a section (unit), so the
 * trail stays the three readable levels of the design.
 */
import { useTranslation } from 'react-i18next';
import { t as tr, type Catalog } from '@bilig/content-model';
import { breadcrumbs, type Crumb } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

export function Breadcrumbs({ catalog, topicKey, fallback, icon }: { catalog: Catalog | undefined; topicKey: string; fallback: Crumb[]; icon?: string }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const openCatalog = useUi((s) => s.openCatalog);
  const fromCatalog = catalog ? breadcrumbs(catalog, topicKey) : [];
  const all = fromCatalog.length ? fromCatalog : fallback;
  const crumbs = all.some((c) => c.kind === 'unit') ? all.filter((c) => c.kind !== 'course') : all;
  return (
    <nav className="crumbs" aria-label={t('a11y.breadcrumbs')}>
      {icon && <Icon name={icon} />}
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.kind}:${c.key}`}>
              {i > 0 && <Icon name="chev" className="sm" />}
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
