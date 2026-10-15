/**
 * App header (TZ W-01): logo, current-subject button (icon, subject, topic),
 * Study / Lesson mode, languages from config, Presentation, theme, profile or
 * sign-in. Switching language NAVIGATES to the same page under the new
 * `/:lang` (fixes the old snap-back bug where only the store changed).
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { UI_LANGS } from '../config';
import { logout, useSession, usePermission } from '../api/session';
import { useDeck } from '../state/deck';
import { useUi } from '../state/ui';
import { useLang, useOnline } from '../lib/hooks';
import { switchLangPath } from '../lib/urls';
import { Icon } from './Icon';

export function Header(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const context = useUi((s) => s.context);
  const openCatalog = useUi((s) => s.openCatalog);
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

  return (
    <header className="header">
      <Link className="brand" to={`/${lang}`} aria-label={t('header.home')}>
        <span className="brand__mark" aria-hidden="true" />
        <span className="brand__text">{t('app.title')}</span>
      </Link>

      <button type="button" className="subject-btn" onClick={openCatalog} aria-haspopup="dialog" aria-label={context ? `${t('header.openCatalog')}: ${tr(context.subject.title, lang)}` : t('header.openCatalog')}>
        <span className="subject-btn__icon">
          <Icon name={context?.subject.icon ?? 'search'} size={18} />
        </span>
        <span className="subject-btn__text">
          <b>{context ? tr(context.subject.title, lang) : t('header.subject')}</b>
          {context?.topicTitle ? <small>{tr(context.topicTitle, lang)}</small> : <small className="hide-sm">{t('catalog.hotkey')}</small>}
        </span>
      </button>

      {isTopic && (
        <div className="segmented" role="group" aria-label={t('header.viewMode')}>
          <button type="button" aria-pressed={!lessonOn} onClick={() => setView(false)}>
            {t('header.study')}
          </button>
          <button type="button" aria-pressed={lessonOn} onClick={() => setView(true)}>
            {t('header.lesson')}
          </button>
        </div>
      )}

      <span className="header__spacer" />

      <div className="header__group">
        {!online && (
          <span className="offline-pill" role="status">
            <Icon name="wifi-off" size={16} />
            {t('header.offlineBadge')}
          </span>
        )}
        <nav className="segmented" aria-label={t('header.language')}>
          {UI_LANGS.map((l) => (
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
        <Link to={`/${lang}/presentation`} className="icon-btn rel" aria-label={slideCount ? t('header.presentCount', { count: slideCount }) : t('header.present')} title={t('header.present')}>
          <Icon name="presentation" />
          {slideCount > 0 && <span className="count-badge" aria-hidden="true">{slideCount}</span>}
        </Link>
        <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')} title={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <ProfileButton />
      </div>
    </header>
  );
}

function ProfileButton(): JSX.Element {
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
    return (
      <Link className="btn btn--primary btn--sm" to={`/${lang}/login`}>
        <Icon name="user" size={18} />
        {t('header.login')}
      </Link>
    );
  }
  return (
    <div className="rel" ref={ref}>
      <button type="button" className="btn btn--sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="user" size={18} />
        <span className="hide-sm">{me.displayName}</span>
        <span className="visually-hidden">{t('header.profile')}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <Link role="menuitem" to={`/${lang}/cabinet`} onClick={() => setOpen(false)}>
            <Icon name="graduation" size={18} />
            {t('header.cabinet')}
          </Link>
          {canTeach && (
            <Link role="menuitem" to={`/${lang}/teacher`} onClick={() => setOpen(false)}>
              <Icon name="users" size={18} />
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
            <Icon name="logout" size={18} />
            {t('header.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
