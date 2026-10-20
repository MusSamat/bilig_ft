/**
 * Subject catalog (TZ W-02): modal dialog with focus trap and Esc; search
 * across ALL languages (subjects, topics, and structures from GET /search);
 * groups and cards from data (icon from the sprite in the subject's hue,
 * model counts, locked «Скоро»). A subject opens its course tree. Nothing
 * here knows any subject or topic by name.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  subjectModelCount,
  t as tr,
  topicsOfSubject,
  type Catalog,
  type Localized,
  type Subject,
  type TopicSummary,
} from '@bilig/content-model';
import { groupedSubjects, subjectSwatch, subjectTree } from '@bilig/scene-core';
import { useCatalog, useServerSearch } from '../api/content';
import { useSession } from '../api/session';
import { Formula } from '../lib/formula';
import { useDebounced, useFocusTrap, useKeydown, useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
const matches = (v: Localized | undefined, q: string) => !!v && Object.values(v).some((s) => norm(s).includes(q));

/** Pure catalog search across every language (also used by tests). */
export function searchCatalog(catalog: Catalog, query: string): { subjects: Subject[]; topics: TopicSummary[] } {
  const q = norm(query.trim());
  if (!q) return { subjects: catalog.subjects, topics: [] };
  return {
    subjects: catalog.subjects.filter((s) => matches(s.title, q)),
    topics: catalog.topics.filter((t) => matches(t.title, q) || matches(t.classification, q) || (t.formula ? norm(t.formula).includes(q) : false)).slice(0, 30),
  };
}

export function CatalogModal(): JSX.Element | null {
  const open = useUi((s) => s.catalogOpen);
  return open ? <CatalogDialog /> : null;
}

function CatalogDialog(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const close = useUi((s) => s.closeCatalog);
  const { data: catalog, isLoading, isError, refetch } = useCatalog();
  const [query, setQuery] = useState('');
  const [subjectKey, setSubjectKey] = useState<string | null>(() => useUi.getState().catalogSubject);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  // Closing (Esc, ×, backdrop, a choice) gives focus back to whatever opened the catalog (WCAG 2.4.3).
  // Read during the first render: by the time effects run, autoFocus has moved focus into the dialog.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null));
  useEffect(
    () => () => {
      // Runs after the focus trap's cleanup (which held the autofocused field, now gone).
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected) return;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.subjbtn')?.focus({ preventScroll: true });
    },
    [opener],
  );
  useKeydown((e) => e.key === 'Escape' && close(), { allowInInputs: true });

  const debounced = useDebounced(query, 250);
  const server = useServerSearch(debounced, lang);
  const result = useMemo(() => (catalog ? searchCatalog(catalog, query) : null), [catalog, query]);
  const groups = useMemo(() => {
    if (!catalog || !result) return [];
    const allowed = new Set(result.subjects.map((s) => s.key));
    return groupedSubjects(catalog)
      .map((g) => ({ ...g, subjects: g.subjects.filter((s) => allowed.has(s.key)) }))
      .filter((g) => g.subjects.length);
  }, [catalog, result]);

  const go = (topicKey: string, focus?: string) => {
    navigate(topicPath(catalog, lang, topicKey) + (focus ? `?focus=${encodeURIComponent(focus)}` : ''));
    close();
  };

  const openSubject = (s: Subject) => {
    if (!catalog || s.status === 'soon') return;
    const topics = topicsOfSubject(catalog, s.key);
    if (topics.length === 1) go(topics[0].key);
    else setSubjectKey(s.key);
  };

  const tree = subjectKey && catalog ? subjectTree(catalog, subjectKey) : null;
  const conceptHits = (server.data?.items ?? []).filter((h) => h.kind === 'concept' && h.topicKey);
  const currentSubject = useUi((s) => s.context?.subject.key);

  return (
    <div className="sheet" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet__body cat" role="dialog" aria-modal="true" aria-labelledby="catalog-title" ref={dialogRef}>
        <div className="sheet__head">
          {tree ? (
            <button type="button" className="ibtn glass" onClick={() => setSubjectKey(null)} aria-label={t('common.back')}>
              <Icon name="prev" />
            </button>
          ) : (
            <Icon name="layers" />
          )}
          <h2 id="catalog-title">{tree ? tr(tree.subject.title, lang) : t('catalog.title')}</h2>
          <button type="button" className="ibtn glass" onClick={close} aria-label={t('common.close')}>
            <Icon name="x" />
          </button>
        </div>

        {!tree && (
          <label className="search">
            <Icon name="search" />
            <input
              type="search"
              autoFocus
              aria-label={t('catalog.searchLabel')}
              placeholder={t('catalog.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}

        {isLoading && (
          <div className="sgrid" aria-busy="true" aria-label={t('common.loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="skel" style={{ height: 70 }} />
            ))}
          </div>
        )}
        {isError && (
          <div className="state state--error" role="alert">
            <Icon name="warn" />
            <b>{t('catalog.loadError')}</b>
            <button type="button" className="btn2" onClick={() => refetch()}>
              <Icon name="reset" className="sm" />
              {t('common.retry')}
            </button>
          </div>
        )}

        {tree ? (
          <div className="stack">
            {tree.courses.map((c) => (
              <section key={c.course.key} aria-label={tr(c.course.title, lang)}>
                <h3 className="grp">{tr(c.course.title, lang)}</h3>
                {c.units.map((u) => (
                  <div key={u.unit.key} className="cat__unit">
                    <b>{tr(u.unit.title, lang)}</b>
                    <div className="hits">
                      {u.topics.map((tp) => (
                        <TopicHit key={tp.key} topic={tp} onOpen={() => go(tp.key)} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <>
            {result && result.topics.length > 0 && (
              <section aria-labelledby="cat-topics">
                <h3 id="cat-topics" className="grp">
                  {t('catalog.topics')}
                </h3>
                <div className="hits">
                  {result.topics.map((tp) => (
                    <TopicHit key={tp.key} topic={tp} onOpen={() => go(tp.key)} />
                  ))}
                </div>
              </section>
            )}
            {conceptHits.length > 0 && (
              <section aria-labelledby="cat-structures">
                <h3 id="cat-structures" className="grp">
                  {t('catalog.structures')}
                </h3>
                <div className="hits">
                  {conceptHits.map((h) => (
                    <button key={`${h.topicKey}:${h.key}`} type="button" className="hit" onClick={() => go(h.topicKey!, h.key)}>
                      <Icon name="focus" />
                      <span>
                        <b>{h.title}</b>
                        {h.snippet && <small>{h.snippet}</small>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.groupKey} aria-labelledby={`grp-${g.groupKey}`}>
                <h3 id={`grp-${g.groupKey}`} className="grp">
                  {tr(g.title, lang)}
                </h3>
                <div className="sgrid">
                  {g.subjects.map((s) => (
                    <SubjectCard key={s.key} subject={s} count={catalog ? subjectModelCount(catalog, s.key) : 0} current={s.key === currentSubject} onOpen={() => openSubject(s)} />
                  ))}
                </div>
              </section>
            ))}
            {catalog && groups.length === 0 && !result?.topics.length && !conceptHits.length && (
              <div className="state">
                <Icon name="search" />
                <b>{t('catalog.empty')}</b>
                <span>{t('catalog.emptyHint')}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SubjectCard({ subject, count, current, onOpen }: { subject: Subject; count: number; current: boolean; onOpen: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const locked = subject.status === 'soon';
  const title = tr(subject.title, lang);
  const sw = subjectSwatch(subject.hue, theme);
  return (
    <button
      type="button"
      className="sc"
      aria-disabled={locked || undefined}
      aria-current={current ? 'true' : undefined}
      aria-label={locked ? t('catalog.locked', { name: title }) : `${title}, ${t('catalog.models', { count })}`}
      onClick={onOpen}
    >
      <span className="si" style={{ background: sw.bg, color: sw.fg }}>
        <Icon name={subject.icon} className="lg" />
      </span>
      <span>
        <b>{title}</b>
        <small>
          {locked ? (
            <>
              <Icon name="lock" className="sm" /> {t('catalog.coming')}
            </>
          ) : (
            t('catalog.models', { count })
          )}
        </small>
      </span>
    </button>
  );
}

function TopicHit({ topic, onOpen }: { topic: TopicSummary; onOpen: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  // Guests may open only the demo topics; the rest still open (with a sign-in prompt).
  const locked = useSession((s) => s.status === 'guest') && topic.demo === false;
  return (
    <button type="button" className={`hit${locked ? ' hit--locked' : ''}`} onClick={onOpen}>
      <Icon name="cube" />
      <span>
        <b>
          {tr(topic.title, lang)}
          {topic.formula && <>{', '}<Formula tex={topic.formula} /></>}
        </b>
        {topic.classification && <small>{tr(topic.classification, lang)}</small>}
      </span>
      {locked && (
        <span className="hit__lock" title={t('catalog.signInToOpen')}>
          <Icon name="lock" className="sm" />
          <span className="visually-hidden">{t('catalog.signInToOpen')}</span>
        </span>
      )}
      <Icon name="chev" className="sm" />
    </button>
  );
}
