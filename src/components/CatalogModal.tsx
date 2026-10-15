/**
 * Subject catalog (TZ W-02): modal dialog with focus trap and Esc; search
 * across ALL languages (subjects, topics, and structures from GET /search);
 * groups and cards from data (icon from the sprite in the subject's hue,
 * model counts, locked «Скоро»). A subject opens its course tree. Nothing
 * here knows any subject or topic by name.
 */
import { useMemo, useRef, useState } from 'react';
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
import { groupedSubjects, subjectTree } from '@bilig/scene-core';
import { useCatalog, useServerSearch } from '../api/content';
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
  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="catalog-title" ref={dialogRef}>
        <div className="modal__head">
          {tree && (
            <button type="button" className="icon-btn" onClick={() => setSubjectKey(null)} aria-label={t('common.back')}>
              <Icon name="arrow-left" />
            </button>
          )}
          <h2 id="catalog-title">{tree ? tr(tree.subject.title, lang) : t('catalog.title')}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>

        {!tree && (
          <div className="search-box">
            <Icon name="search" />
            <input
              className="input"
              type="search"
              autoFocus
              aria-label={t('catalog.searchLabel')}
              placeholder={t('catalog.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {isLoading && <p className="muted">{t('common.loading')}</p>}
        {isError && (
          <div className="row">
            <p className="error-text">{t('catalog.loadError')}</p>
            <button type="button" className="btn btn--sm" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {tree ? (
          <div className="stack">
            {tree.courses.map((c) => (
              <section key={c.course.key} className="catalog-group">
                <h3>{tr(c.course.title, lang)}</h3>
                {c.units.map((u) => (
                  <div key={u.unit.key} className="stack">
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
              <section className="catalog-group" aria-labelledby="cat-topics">
                <h3 id="cat-topics">{t('catalog.topics')}</h3>
                <div className="hits">
                  {result.topics.map((tp) => (
                    <TopicHit key={tp.key} topic={tp} onOpen={() => go(tp.key)} />
                  ))}
                </div>
              </section>
            )}
            {conceptHits.length > 0 && (
              <section className="catalog-group" aria-labelledby="cat-structures">
                <h3 id="cat-structures">{t('catalog.structures')}</h3>
                <div className="hits">
                  {conceptHits.map((h) => (
                    <button key={`${h.topicKey}:${h.key}`} type="button" className="topic-hit" onClick={() => go(h.topicKey!, h.key)}>
                      <Icon name="dot" />
                      <span>
                        <b>{h.title}</b>
                        {h.snippet && <span className="muted small"> — {h.snippet}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.groupKey} className="catalog-group" aria-labelledby={`grp-${g.groupKey}`}>
                <h3 id={`grp-${g.groupKey}`}>{tr(g.title, lang)}</h3>
                <div className="catalog-grid">
                  {g.subjects.map((s) => (
                    <SubjectCard key={s.key} subject={s} count={catalog ? subjectModelCount(catalog, s.key) : 0} onOpen={() => openSubject(s)} />
                  ))}
                </div>
              </section>
            ))}
            {catalog && groups.length === 0 && !result?.topics.length && !conceptHits.length && <p className="muted">{t('catalog.empty')}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function SubjectCard({ subject, count, onOpen }: { subject: Subject; count: number; onOpen: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const locked = subject.status === 'soon';
  const title = tr(subject.title, lang);
  return (
    <button
      type="button"
      className="subject-card"
      style={{ ['--h' as string]: String(subject.hue) }}
      aria-disabled={locked || undefined}
      aria-label={locked ? t('catalog.locked', { name: title }) : `${title}, ${t('catalog.models', { count })}`}
      onClick={onOpen}
    >
      <span className="subject-card__icon">
        <Icon name={subject.icon} size={24} />
      </span>
      <span className="subject-card__title">{title}</span>
      {locked ? (
        <span className="badge">
          <Icon name="lock" size={14} />
          {t('catalog.coming')}
        </span>
      ) : (
        <span className="muted small">{t('catalog.models', { count })}</span>
      )}
    </button>
  );
}

function TopicHit({ topic, onOpen }: { topic: TopicSummary; onOpen: () => void }): JSX.Element {
  const lang = useLang();
  return (
    <button type="button" className="topic-hit" onClick={onOpen}>
      <Icon name="chevron-right" />
      <span>
        <b>{tr(topic.title, lang)}</b>
        {topic.formula && <>{', '}<Formula tex={topic.formula} /></>}
        {topic.classification && <span className="muted small"> — <i>{tr(topic.classification, lang)}</i></span>}
      </span>
    </button>
  );
}
