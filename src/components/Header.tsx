/**
 * App header (TZ W-01), one line at every width: logo + serif wordmark, the
 * subject pill (accent circle with the subject icon, subject, current
 * section, chevron), then the compact language menu, theme and profile.
 * Controls that act on one topic (Lesson / Explore, the topic's language and
 * presentation) live in the topic toolbar instead, so on topic pages the
 * language menu is there and not here.
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { logout, useSession, usePermission } from '../api/session';
import { useLang, useOnline } from '../lib/hooks';
import { useUi } from '../state/ui';
import { Icon } from './Icon';
import { LangMenu } from './LangMenu';
import { LogoMark } from './Logo';
import { useMenu } from './Menu';

export function Header(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const context = useUi((s) => s.context);
  const openCatalog = useUi((s) => s.openCatalog);
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const online = useOnline();

  const isTopic = !!context?.topicTitle;
  const subtitle = context?.unitTitle ?? context?.topicTitle;
  const themeLabel =
    theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark');

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
        aria-label={
          context
            ? `${t('header.openCatalog')}: ${tr(context.subject.title, lang)}`
            : t('header.openCatalog')
        }
      >
        <span className="st">
          <Icon name={context?.subject.icon ?? 'search'} />
        </span>
        {/* Below 480px without a subject only the icon shows (its name is in aria-label), so it never reads «Пре…». */}
        <span className={context ? 'subjbtn__text' : 'subjbtn__text max-sm:sr-only'}>
          <b>
            {context ? tr(context.subject.title, lang) : t('header.subject')}
          </b>
          <small className="text-sm">{subtitle ? tr(subtitle, lang) : t('catalog.title')}</small>
        </span>
        <Icon name="down" className="sm" />
      </button>

      <span className="spacer" />

      {!online && (
        <span className="pill pill--bad top__offline" role="status">
          <Icon name="wifioff" />
          <span className="top__label">{t('header.offlineBadge')}</span>
        </span>
      )}

      {!isTopic && <LangMenu className="top__lang" />}
      <button
        type="button"
        className="ibtn glass"
        onClick={toggleTheme}
        aria-label={themeLabel}
        title={themeLabel}
      >
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
  const m = useMenu();
  const setOpen = m.setOpen;

  if (!me) {
    // Come back here after signing in (but not to the login page itself).
    const here = location.pathname + location.search;
    const next =
      /\/login$/.test(location.pathname) || here === `/${lang}`
        ? ''
        : `?next=${encodeURIComponent(here)}`;
    return (
      <Link
        className="btn2 top__login"
        to={`/${lang}/login${next}`}
        aria-label={t('header.login')}
      >
        <Icon name="user" />
        <span className="top__label">{t('header.login')}</span>
      </Link>
    );
  }
  return (
    <div className="rel" ref={m.rootRef}>
      <button
        type="button"
        className="ibtn glass"
        {...m.buttonProps}
        aria-label={`${t('header.profile')}: ${me.displayName}`}
        title={me.displayName}
      >
        <Icon name="user" />
      </button>
      {m.open && (
        <div className="menu" {...m.menuProps} aria-label={t('header.profile')}>
          <div className="menu__head" role="presentation">
            <b>{me.displayName}</b>
            <small>{t('header.profile')}</small>
          </div>
          {/* One cabinet per person: a teacher's is the teacher cabinet (profile included). */}
          {canTeach ? (
            <Link
              role="menuitem"
              to={`/${lang}/teacher`}
              onClick={() => setOpen(false)}
            >
              <Icon name="users" />
              {t('header.teacher')}
            </Link>
          ) : (
            <Link
              role="menuitem"
              to={`/${lang}/cabinet`}
              onClick={() => setOpen(false)}
            >
              <Icon name="grad" />
              {t('header.cabinet')}
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
