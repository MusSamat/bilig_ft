/**
 * Admin chrome in the «Bilig Workbench» style: a sticky blurred top bar
 * (brand, global search, RU/KY, theme, user menu) and a glass sidebar with
 * grouped navigation filtered by permissions (an icon rail ≤980px, a drawer
 * ≤720px).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { EndpointName } from '@bilig/content-model/api';
import { LogoMark } from '../../components/Logo';
import { canCallWith } from '../api/hooks';
import { api, useSession } from '../api/session';
import { ADMIN_LANGS, useAdminLang, useT } from '../i18n';
import { Icon } from '../lib/icons';
import { useAdminPath } from './base';
import { useAdminTheme } from './theme';

export type NavSection = 'content' | 'programme' | 'translations' | 'publishing' | 'org' | 'ops';

export interface NavItem {
  path: string;
  titleKey: string;
  /** The endpoint whose permission decides whether the item is shown. */
  endpoint: EndpointName;
  section: NavSection;
  icon: string;
}

export const NAV: NavItem[] = [
  { path: '', titleKey: 'nav.dashboard', endpoint: 'adminTopicList', section: 'content', icon: 'a-dashboard' },
  { path: 'subjects', titleKey: 'nav.subjects', endpoint: 'adminSubjectList', section: 'content', icon: 'layers' },
  { path: 'topics', titleKey: 'nav.topics', endpoint: 'adminTopicList', section: 'content', icon: 'a-topic' },
  { path: 'concepts', titleKey: 'nav.concepts', endpoint: 'adminConceptList', section: 'content', icon: 'atom' },
  { path: 'assets', titleKey: 'nav.assets', endpoint: 'adminAssetList', section: 'content', icon: 'cube' },
  { path: 'processes', titleKey: 'nav.processes', endpoint: 'adminProcessList', section: 'content', icon: 'a-steps' },
  { path: 'items', titleKey: 'nav.items', endpoint: 'adminItemList', section: 'content', icon: 'a-quiz' },
  { path: 'programme', titleKey: 'nav.programme', endpoint: 'adminCourseList', section: 'programme', icon: 'grad' },
  { path: 'translations', titleKey: 'nav.translations', endpoint: 'adminStrings', section: 'translations', icon: 'globe' },
  { path: 'glossary', titleKey: 'nav.glossary', endpoint: 'adminGlossaryList', section: 'translations', icon: 'a-glossary' },
  { path: 'publishing', titleKey: 'nav.publishing', endpoint: 'adminTopicList', section: 'publishing', icon: 'a-publish' },
  { path: 'review', titleKey: 'nav.review', endpoint: 'adminTopicList', section: 'publishing', icon: 'a-review' },
  { path: 'schools', titleKey: 'nav.schools', endpoint: 'adminSchoolList', section: 'org', icon: 'school' },
  { path: 'users', titleKey: 'nav.users', endpoint: 'adminUsers', section: 'org', icon: 'users' },
  { path: 'analytics', titleKey: 'nav.analytics', endpoint: 'adminAnalyticsOverview', section: 'ops', icon: 'chart' },
  { path: 'tutor', titleKey: 'nav.tutor', endpoint: 'adminTutorSettingsGet', section: 'ops', icon: 'a-tutor' },
  { path: 'audit', titleKey: 'nav.audit', endpoint: 'adminAudit', section: 'ops', icon: 'a-audit' },
];

const EXTRA_ICONS: Record<string, string> = { groups: 'a-folder', courses: 'grad', units: 'a-folder', objectives: 'target' };

/** The nav icon for a route segment (pages outside the nav get a related glyph). */
export const navIcon = (path: string): string | undefined => NAV.find((n) => n.path === path)?.icon ?? EXTRA_ICONS[path];

const SECTIONS: readonly NavSection[] = ['content', 'programme', 'translations', 'publishing', 'org', 'ops'];

export function hasAdminAccess(perms: readonly string[] | undefined) {
  return NAV.some((n) => canCallWith(perms, n.endpoint));
}

/** Global search: jump to a section by name, or search topics by key. */
function GlobalSearch({ items }: { items: NavItem[] }) {
  const t = useT();
  const to = useAdminPath();
  const nav = useNavigate();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const canTopics = items.some((i) => i.path === 'topics');
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter((i) => t(i.titleKey).toLowerCase().includes(s)).slice(0, 6);
  }, [q, items, t]);
  const options = [
    ...hits.map((h) => ({ key: h.path || '$home', label: t(h.titleKey), icon: h.icon, go: () => nav(to(h.path)) })),
    ...(canTopics && q.trim() ? [{ key: '$topics', label: t('app.searchTopics', { q: q.trim() }), icon: 'search', go: () => nav(`${to('topics')}?q=${encodeURIComponent(q.trim())}`) }] : []),
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const pick = (i: number) => {
    options[i]?.go();
    setQ('');
    setOpen(false);
    ref.current?.blur();
  };
  return (
    <div className="adm-gsearch">
      <label className="adm-searchbox adm-searchbox--lg">
        <Icon id="search" />
        <input
          ref={ref}
          type="search"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-label={t('app.search')}
          placeholder={t('app.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && options.length) {
              e.preventDefault();
              pick(active);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
        <kbd className="adm-kbd" aria-hidden="true">
          /
        </kbd>
      </label>
      {open && options.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="adm-gsearch__list">
          {options.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} onMouseEnter={() => setActive(i)}>
              <Icon id={o.icon} size={18} />
              <span>{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserMenu() {
  const t = useT();
  const me = useSession((s) => s.me);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const name = me?.displayName ?? '';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const email = (me as { email?: string } | null)?.email;
  return (
    <div className="adm-usermenu" ref={ref}>
      <button type="button" className="adm-userbtn" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="adm-avatar" aria-hidden="true">
          {initials || <Icon id="user" size={18} />}
        </span>
        <span className="adm-user">{name}</span>
        <Icon id="down" size={16} />
      </button>
      {open && (
        <div id={id} role="menu" className="adm-menu">
          <div className="adm-menu__head">
            <b>{name}</b>
            {email && <small>{email}</small>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await api.call('logout', { body: {} }).catch(() => undefined);
              useSession.getState().signOut();
            }}
          >
            <Icon id="logout" size={18} />
            {t('app.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Brand() {
  const t = useT();
  return (
    <span className="adm-brand">
      <LogoMark size={34} />
      <b>Bilig</b>
      <span className="adm-brand__pill">{t('app.badge')}</span>
    </span>
  );
}

export function LangSeg() {
  const t = useT();
  const { lang, setLang } = useAdminLang();
  return (
    <div className="adm-seg" role="group" aria-label={t('app.language')}>
      {ADMIN_LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} lang={l} title={t(`app.lang.${l}`)} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function ThemeButton() {
  const t = useT();
  const { theme, toggle } = useAdminTheme();
  return (
    <button type="button" className="adm-ibtn adm-ibtn--glass" aria-label={t('app.theme')} title={t('app.theme')} onClick={toggle}>
      <Icon id={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export function Layout() {
  const t = useT();
  const to = useAdminPath();
  const loc = useLocation();
  const me = useSession((s) => s.me);
  const [drawer, setDrawer] = useState(false);
  const items = NAV.filter((n) => canCallWith(me?.permissions, n.endpoint));
  useEffect(() => setDrawer(false), [loc.pathname]);
  return (
    <div className={`adm-layout${drawer ? ' is-drawer' : ''}`}>
      <a className="adm-skip" href="#adm-main">
        {t('nav.skip')}
      </a>
      <header className="adm-topbar">
        <button type="button" className="adm-ibtn adm-ibtn--glass adm-menu-toggle" aria-label={t('app.menu')} aria-expanded={drawer} aria-controls="adm-sidebar" onClick={() => setDrawer(!drawer)}>
          <Icon id={drawer ? 'x' : 'menu'} />
        </button>
        <NavLink to={to('')} end className="adm-brand-link" aria-label={t('app.title')}>
          <Brand />
        </NavLink>
        <GlobalSearch items={items} />
        <span className="adm-spacer" />
        <LangSeg />
        <ThemeButton />
        <UserMenu />
      </header>
      <div className="adm-frame">
        <aside className="adm-sidebar" id="adm-sidebar">
          <nav aria-label={t('nav.label')}>
            {SECTIONS.map((s) => {
              const list = items.filter((i) => i.section === s);
              if (!list.length) return null;
              return (
                <div key={s} className="adm-nav-section">
                  <h2>{t(`nav.section.${s}`)}</h2>
                  <ul>
                    {list.map((i) => (
                      <li key={i.path}>
                        <NavLink end={i.path === ''} to={to(i.path)} title={t(i.titleKey)}>
                          <Icon id={i.icon} />
                          <span className="adm-nav-label">{t(i.titleKey)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>
        {drawer && <button type="button" className="adm-scrim" aria-label={t('common.close')} onClick={() => setDrawer(false)} />}
        <main id="adm-main" className="adm-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
