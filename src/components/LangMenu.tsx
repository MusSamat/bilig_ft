/**
 * Compact language switch: one button with a globe and the current code
 * («KY ▾»), opening a small menu with the three languages. Choosing NAVIGATES
 * to the same page under the new `/:lang` (W-05). Used in the header on most
 * pages and in the topic toolbar on topic pages (never both at once).
 */
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HEADER_LANGS } from '../config';
import { useLang } from '../lib/hooks';
import { switchLangPath } from '../lib/urls';
import { Icon } from './Icon';
import { useMenu } from './Menu';

export function LangMenu({
  className = '',
}: {
  className?: string;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const location = useLocation();
  const m = useMenu();
  const label = t('header.language');
  return (
    <div className={`rel ${className}`.trim()} ref={m.rootRef}>
      <button
        type="button"
        className="btn2 langbtn"
        {...m.buttonProps}
        aria-label={`${label}: ${t(`header.langName.${lang}`, { lng: lang })}`}
        title={label}
      >
        <Icon name="globe" className="sm" />
        <span aria-hidden="true">{lang.toUpperCase()}</span>
        <Icon name="down" className="sm langbtn__chev" />
      </button>
      {m.open && (
        <div className="menu menu--lang" {...m.menuProps} aria-label={label}>
          {HEADER_LANGS.map((l) => (
            <Link
              key={l}
              role="menuitemradio"
              aria-checked={l === lang}
              to={switchLangPath(
                location.pathname,
                location.search,
                location.hash,
                l,
              )}
              hrefLang={l}
              lang={l}
              onClick={() => m.close()}
            >
              <span className="menu__code" aria-hidden="true">
                {l.toUpperCase()}
              </span>
              {t(`header.langName.${l}`, { lng: l })}
              {l === lang && <Icon name="check" className="sm menu__check" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
