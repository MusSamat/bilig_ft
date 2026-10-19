/**
 * App header (TZ W-01), Workbench layout: logo + serif wordmark, the subject
 * pill (accent circle with the subject icon, subject, current section, chevron),
 * Lesson / Study segmented control (topic pages; the lesson is the default,
 * `?view=study` explores), the presentation CTA (on a topic: a menu with the
 * topic's ready-made .pptx / .pdf and the teacher's own slides), theme and
 * profile round buttons. The language choice lives in the profile menu (a
 * compact globe button for guests); switching NAVIGATES to the same page under
 * the new `/:lang` (W-05).
 */
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr, type Lang } from '@bilig/content-model';
import { isApiError } from '../api/client';
import { HEADER_LANGS } from '../config';
import { logout, useSession, usePermission } from '../api/session';
import { saveFile } from '../lib/download';
import { useLang, useOnline } from '../lib/hooks';
import { switchLangPath } from '../lib/urls';
import { isLessonView, withView } from '../lib/view';
import { fetchTopicDeck, type TopicDeckFormat } from '../presentation/topicDeck';
import { useDeck } from '../state/deck';
import { toast, useUi } from '../state/ui';
import { Icon } from './Icon';
import { LogoMark } from './Logo';
import { MenuGroup, useMenu } from './Menu';

export function Header(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const context = useUi((s) => s.context);
  const openCatalog = useUi((s) => s.openCatalog);
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const signedIn = useSession((s) => !!s.me);
  const online = useOnline();

  const isTopic = !!context?.topicTitle;
  const lessonOn = isLessonView(params);
  const setView = (lesson: boolean) => {
    if (lesson !== lessonOn) setParams(withView(params, lesson), { replace: false });
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
        <div className="seg top__view" role="group" aria-label={t('header.viewMode')}>
          <button type="button" aria-pressed={lessonOn} onClick={() => setView(true)} title={t('header.lessonHint')} aria-describedby="hdr-lesson-hint">
            <Icon name="deck" className="sm" />
            {t('header.lesson')}
          </button>
          <button type="button" aria-pressed={!lessonOn} onClick={() => setView(false)} title={t('header.studyHint')} aria-describedby="hdr-study-hint">
            <Icon name="cube" className="sm" />
            {t('header.study')}
          </button>
          <span id="hdr-lesson-hint" className="visually-hidden">
            {t('header.lessonHint')}
          </span>
          <span id="hdr-study-hint" className="visually-hidden">
            {t('header.studyHint')}
          </span>
        </div>
      )}

      <PresentButton topicKey={isTopic ? context?.topicKey : undefined} />

      <button type="button" className="ibtn glass" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      {!signedIn && <LangButton />}
      <ProfileButton />
    </header>
  );
}

/** The three languages as `menuitemradio` links to the same page under the new `/:lang`. */
function LangItems({ onPick }: { onPick: () => void }): JSX.Element {
  const location = useLocation();
  const lang = useLang();
  const { t } = useTranslation();
  return (
    <>
      {HEADER_LANGS.map((l) => (
        <Link
          key={l}
          role="menuitemradio"
          aria-checked={l === lang}
          to={switchLangPath(location.pathname, location.search, location.hash, l)}
          hrefLang={l}
          lang={l}
          onClick={onPick}
        >
          <span className="menu__code" aria-hidden="true">
            {l.toUpperCase()}
          </span>
          {t(`header.langName.${l}`, { lng: l })}
          {l === lang && <Icon name="check" className="sm menu__check" />}
        </Link>
      ))}
    </>
  );
}

/** Guests (no profile menu): one compact globe button with the current language code. */
function LangButton(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const m = useMenu();
  const label = t('header.language');
  return (
    <div className="rel" ref={m.rootRef}>
      <button
        type="button"
        className="btn2 top__lang"
        {...m.buttonProps}
        aria-label={`${label}: ${t(`header.langName.${lang}`, { lng: lang })}`}
        title={label}
      >
        <Icon name="globe" className="sm" />
        <span aria-hidden="true">{lang.toUpperCase()}</span>
      </button>
      {m.open && (
        <div className="menu menu--lang" {...m.menuProps} aria-label={label}>
          <LangItems onPick={() => m.close()} />
        </div>
      )}
    </div>
  );
}

const deckErrorKey = (e: unknown): string => {
  if (!isApiError(e)) return 'header.deck.failed';
  if (e.status === 401) return 'header.deck.needSignIn';
  if (e.status === 403 || e.i18nKey === 'errors.license_required') return 'header.deck.noLicence';
  return e.status === 0 ? e.i18nKey : 'header.deck.failed';
};

/**
 * Presentation CTA. On a topic page: a menu with the topic's ready-made
 * presentation (.pptx / .pdf in the UI language, generated on the server) and,
 * when the basket has slides, «My slides (N)» → the builder. Elsewhere it opens
 * the builder as before, and is hidden while the basket is empty.
 */
function PresentButton({ topicKey }: { topicKey?: string }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const openSlides = useUi((s) => s.openSlides);
  const slideCount = useDeck((s) => s.slides.length);
  const [busy, setBusy] = useState<TopicDeckFormat | null>(null);
  const m = useMenu();

  if (!topicKey) {
    if (!slideCount) return null;
    return (
      <button type="button" className="cta top__slides" onClick={openSlides} aria-haspopup="dialog" aria-label={t('header.presentCount', { count: slideCount })}>
        <Icon name="deck" />
        <span className="top__label">{t('header.present')}</span>
        <span className="count-badge" aria-hidden="true">
          {slideCount}
        </span>
      </button>
    );
  }

  const download = async (format: TopicDeckFormat, key: string, l: Lang) => {
    m.close(true);
    setBusy(format);
    try {
      saveFile(await fetchTopicDeck(key, l, format));
      toast({ key: 'header.deck.downloaded', kind: 'success' });
    } catch (e) {
      toast({ key: deckErrorKey(e), kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rel" ref={m.rootRef}>
      <button
        type="button"
        className="cta top__slides"
        {...m.buttonProps}
        aria-busy={busy ? true : undefined}
        aria-label={busy ? t('header.deck.preparing') : t('header.deck.menu')}
        title={t('header.deck.menu')}
      >
        <Icon name={busy ? 'sync' : 'deck'} className={busy ? 'spin' : undefined} />
        <span className="top__label">{busy ? t('header.deck.preparingShort') : t('header.present')}</span>
        {slideCount > 0 && (
          <span className="count-badge" aria-hidden="true">
            {slideCount}
          </span>
        )}
        <Icon name="down" className="sm" />
      </button>
      <span className="visually-hidden" role="status">
        {busy ? t('header.deck.preparing') : ''}
      </span>
      {m.open && (
        <div className="menu" {...m.menuProps} aria-label={t('header.deck.menu')}>
          <MenuGroup label={t('header.deck.ready')}>
            {(['pptx', 'pdf'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="menuitem"
                disabled={!!busy}
                aria-disabled={busy ? true : undefined}
                onClick={() => void download(f, topicKey, lang)}
              >
                <Icon name="download" />
                {t(`header.deck.${f}`)}
              </button>
            ))}
          </MenuGroup>
          {slideCount > 0 && (
            <>
              <div className="menu__sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                aria-haspopup="dialog"
                onClick={() => {
                  m.close();
                  openSlides();
                }}
              >
                <Icon name="presentation" />
                {t('header.deck.mySlides', { count: slideCount })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
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
    const next = /\/login$/.test(location.pathname) || here === `/${lang}` ? '' : `?next=${encodeURIComponent(here)}`;
    return (
      <Link className="btn2 top__login" to={`/${lang}/login${next}`} aria-label={t('header.login')}>
        <Icon name="user" />
        <span className="top__label">{t('header.login')}</span>
      </Link>
    );
  }
  return (
    <div className="rel" ref={m.rootRef}>
      <button type="button" className="ibtn glass" {...m.buttonProps} aria-label={`${t('header.profile')}: ${me.displayName}`} title={me.displayName}>
        <Icon name="user" />
      </button>
      {m.open && (
        <div className="menu" {...m.menuProps} aria-label={t('header.profile')}>
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
          <div className="menu__sep" role="separator" />
          <MenuGroup label={t('header.language')}>
            <LangItems onPick={() => setOpen(false)} />
          </MenuGroup>
        </div>
      )}
    </div>
  );
}
