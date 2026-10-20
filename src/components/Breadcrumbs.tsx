/**
 * Breadcrumbs (TZ W-04): the subject icon, then subject › section › topic in
 * muted text with chevrons — always ONE line: the levels ellipsize instead of
 * wrapping (audit P-10). Below md only the parent level is shown («‹ Кан
 * айлануу системасы»), since the page title names the topic right below.
 * Any depth is supported; the course level is folded when the topic has a
 * section (unit), so the trail stays the three readable levels of the design.
 */
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr, type Catalog } from '@bilig/content-model';
import { breadcrumbs, type Crumb } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

const LINK = 'min-w-0 truncate rounded-sm text-muted no-underline hover:text-ink hover:underline';

export function Breadcrumbs({ catalog, topicKey, fallback, icon }: { catalog: Catalog | undefined; topicKey: string; fallback: Crumb[]; icon?: string }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const openCatalog = useUi((s) => s.openCatalog);
  const fromCatalog = catalog ? breadcrumbs(catalog, topicKey) : [];
  const all = fromCatalog.length ? fromCatalog : fallback;
  const crumbs = all.some((c) => c.kind === 'unit') ? all.filter((c) => c.kind !== 'course') : all;
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
  const open = (e: MouseEvent) => {
    e.preventDefault();
    openCatalog();
  };
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-muted" aria-label={t('a11y.breadcrumbs')}>
      {icon && <Icon name={icon} className="sm shrink-0 text-accent" />}
      <ol className="m-0 hidden min-w-0 list-none items-center gap-1.5 overflow-hidden whitespace-nowrap p-0 md:flex">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            // Earlier levels shrink first; the current topic keeps the most room.
            <li key={`${c.kind}:${c.key}`} className={`flex min-w-0 items-center gap-1.5 ${last ? 'shrink' : 'shrink-[3]'}`}>
              {i > 0 && <Icon name="chev" className="sm shrink-0" />}
              {last ? (
                <span aria-current="page" className="min-w-0 truncate" title={tr(c.title, lang)}>
                  {tr(c.title, lang)}
                </span>
              ) : (
                <a href="#catalog" className={`${LINK} block min-h-6 leading-6`} title={tr(c.title, lang)} onClick={open}>
                  {tr(c.title, lang)}
                </a>
              )}
            </li>
          );
        })}
      </ol>
      {parent && (
        <a href="#catalog" className={`${LINK} inline-flex min-h-11 items-center gap-1 md:hidden`} onClick={open}>
          <Icon name="prev" className="sm shrink-0" />
          <span className="truncate">{tr(parent.title, lang)}</span>
        </a>
      )}
    </nav>
  );
}
