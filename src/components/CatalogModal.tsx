/**
 * Subject catalog (TZ W-02): modal with search, data-driven groups, cards in the
 * subject's color, and a locked "Скоро" state. Nothing here knows a subject name —
 * it's all rendered from the catalog payload.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Catalog, Subject } from '@bilig/content-model';
import { t as tr } from '@bilig/content-model';
import { fetchCatalog, fetchPackage } from '../api';
import { useStore } from '../store';
import { buildStateUrl } from '@bilig/scene-core';

export function CatalogModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchCatalog().then(setCatalog);
  }, []);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) return catalog.subjects;
    // Search across all languages (TZ W-02: "поиск по всем языкам").
    return catalog.subjects.filter((s) =>
      Object.values(s.title).some((v) => v?.toLowerCase().includes(q)),
    );
  }, [catalog, query]);

  const openSubject = async (s: Subject): Promise<void> => {
    if (s.status === 'coming') return;
    const pkg = await fetchPackage(s.slug);
    const topic = pkg?.topics[0];
    if (!topic) return;
    navigate(
      buildStateUrl({
        lang,
        subjectSlug: s.slug,
        grade: topic.grade,
        topicSlug: topic.slug,
      }),
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>{t('catalog.title')}</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          className="search"
          autoFocus
          placeholder={t('catalog.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {!catalog && <p className="muted">{t('common.loading')}</p>}

        {catalog?.groups.map((g) => {
          const subs = filtered.filter((s) => s.group === g.id);
          if (subs.length === 0) return null;
          return (
            <section key={g.id} className="catalog-group">
              <h3>{tr(g.title, lang)}</h3>
              <div className="catalog-grid">
                {subs.map((s) => (
                  <button
                    key={s.id}
                    className={`subject-card ${s.status === 'coming' ? 'is-locked' : ''}`}
                    style={{ ['--hue' as string]: String(s.hue) }}
                    onClick={() => void openSubject(s)}
                  >
                    <span className="subject-card__icon" />
                    <span className="subject-card__title">{tr(s.title, lang)}</span>
                    {s.status === 'coming' && (
                      <span className="badge">🔒 {t('catalog.coming')}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {catalog && filtered.length === 0 && <p className="muted">{t('catalog.empty')}</p>}
      </div>
    </div>
  );
}
