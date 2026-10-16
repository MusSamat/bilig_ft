/**
 * App header (TZ W-01), Workbench layout: logo + serif wordmark, the subject
 * pill (accent circle with the subject icon, subject, current section, chevron),
 * Study / Lesson segmented control (topic pages), language segmented control
 * (RU · KY · EN), the slides CTA, theme and profile round buttons. Switching
 * language NAVIGATES to the same page under the new `/:lang` (W-05).
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { HEADER_LANGS } from '../config';
import { logout, useSession, usePermission } from '../api/session';
import { useDeck } from '../state/deck';
import { useUi } from '../state/ui';
import { useLang, useOnline } from '../lib/hooks';
import { switchLangPath } from '../lib/urls';
import { Icon } from './Icon';
import { LogoMark } from './Logo';

export function Header(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const context = useUi((s) => s.context);
  const openCatalog = useUi((s) => s.openCatalog);
  const openSlides = useUi((s) => s.openSlides);
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const slideCount = useDeck((s) => s.slides.length);
  const online = useOnline();

  const isTopic = !!context?.topicTitle;
  const lessonOn = params.get('view') === 'lesson';
  const setView = (lesson: boolean) => {
    const next = new URLSearchParams(params);
    if (lesson) next.set('view', 'lesson');
    else {
      next.delete('view');
      next.delete('lesson');
    }
    setParams(next, { replace: false });
  };
  const subtitle = context?.unitTitle ?? context?.topicTitle;
  const themeLabel = theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark');

  return (
    <header className="top">
      <Link className="brand" to={`/${lang}`} aria-label={t('header.home')}>
        <LogoMark />
        <b aria-hidden="true">{t('app.title')}</b>
      </Link>

      <button
        type="button"
        className="subjbtn glass"
        onClick={() => openCatalog()}
        aria-haspopup="dialog"
        aria-label={context ? `${t('header.openCatalog')}: ${tr(context.subject.title, lang)}` : t('header.openCatalog')}
      >
        <span className="st">
          <Icon name={context?.subject.icon ?? 'search'} />
        </span>
        <span className="subjbtn__text">
          <b>{context ? tr(context.subject.title, lang) : t('header.subject')}</b>
          <small>{subtitle ? tr(subtitle, lang) : t('catalog.title')}</small>
        </span>
        <Icon name="down" className="sm" />
      </button>

      <span className="spacer" />

      {!online && (
        <span className="pill pill--bad" role="status">
          <Icon name="wifioff" />
          {t('header.offlineBadge')}
        </span>
      )}

      {isTopic && (
        <div className="seg" role="group" aria-label={t('header.viewMode')}>
          <button type="button" aria-pressed={!lessonOn} onClick={() => setView(false)}>
            <Icon name="book" className="sm" />
            {t('header.study')}
          </button>
          <button type="button" aria-pressed={lessonOn} onClick={() => setView(true)}>
            <Icon name="deck" className="sm" />
            {t('header.lesson')}
          </button>
        </div>
      )}

      <nav className="seg" aria-label={t('header.language')}>
        {HEADER_LANGS.map((l) => (
          <Link
            key={l}
            to={switchLangPath(location.pathname, location.search, location.hash, l)}
            hrefLang={l}
            lang={l}
            aria-current={l === lang ? 'true' : undefined}
            aria-label={t(`header.langName.${l}`, { lng: l })}
          >
            {l.toUpperCase()}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        className="cta top__slides"
        onClick={openSlides}
        aria-haspopup="dialog"
        aria-label={slideCount ? t('header.presentCount', { count: slideCount }) : t('header.present')}
      >
        <Icon name="deck" />
        <span className="top__label">{t('header.present')}</span>
        {slideCount > 0 && (
          <span className="count-badge" aria-hidden="true">
            {slideCount}
          </span>
        )}
      </button>

      <button type="button" className="ibtn glass" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <ProfileButton />
    </header>
  );
}

function ProfileButton(): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const me = useSession((s) => s.me);
  const canTeach = usePermission('class.manage');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!me) {
    // Come back here after signing in (but not to the login page itself).
    const here = location.pathname + location.search;
    const next = /\/login$/.test(location.pathname) || here === `/${lang}` ? '' : `?next=${encodeURIComponent(here)}`;
    return (
      <Link className="btn2 top__login" to={`/${lang}/login${next}`} aria-label={t('header.login')}>
        <Icon name="user" />
        <span className="top__label">{t('header.login')}</span>
      </Link>
    );
  }
  return (
    <div className="rel" ref={ref}>
      <button
        type="button"
        className="ibtn glass"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('header.profile')}: ${me.displayName}`}
        title={me.displayName}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="user" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu__head" role="presentation">
            <b>{me.displayName}</b>
            <small>{t('header.profile')}</small>
          </div>
          <Link role="menuitem" to={`/${lang}/cabinet`} onClick={() => setOpen(false)}>
            <Icon name="grad" />
            {t('header.cabinet')}
          </Link>
          {canTeach && (
            <Link role="menuitem" to={`/${lang}/teacher`} onClick={() => setOpen(false)}>
              <Icon name="users" />
              {t('header.teacher')}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate(`/${lang}`);
            }}
          >
            <Icon name="logout" />
            {t('header.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
