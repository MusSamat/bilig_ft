/**
 * Subject catalog (TZ W-02): search across languages, data-driven groups, cards
 * in the subject's color with the model count, locked «Скоро» state. Nothing
 * here knows a subject name — it renders the catalog payload.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  gradeSegment,
  subjectModelCount,
  t as tr,
  topicsOfSubject,
  type Catalog,
  type Subject,
} from '@bilig/content-model';
import { buildStateUrl, groupedSubjects } from '@bilig/scene-core';
import { fetchCatalog } from '../api';
import { useStore } from '../store';

export function CatalogModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null | undefined>(undefined);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchCatalog().then(setCatalog);
  }, []);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const match = (s: Subject) => !q || Object.values(s.title).some((v) => v.toLowerCase().includes(q));
    return groupedSubjects(catalog)
      .map((g) => ({ ...g, subjects: g.subjects.filter(match) }))
      .filter((g) => g.subjects.length > 0);
  }, [catalog, query]);

  const openSubject = (s: Subject): void => {
    if (!catalog || s.status === 'soon') return;
    const topic = topicsOfSubject(catalog, s.key)[0];
    if (!topic) return;
    const unit = catalog.units.find((u) => u.key === topic.unitKey);
    const course = unit && catalog.courses.find((c) => c.key === unit.courseKey);
    navigate(
      buildStateUrl({
        lang,
        subjectKey: s.key,
        grade: course ? gradeSegment(course.grade) : undefined,
        topicKey: topic.key,
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

        {catalog === undefined && <p className="muted">{t('common.loading')}</p>}

        {groups.map((g) => (
          <section key={g.groupKey} className="catalog-group">
            <h3>{tr(g.title, lang)}</h3>
            <div className="catalog-grid">
              {g.subjects.map((s) => (
                <button
                  key={s.key}
                  className={`subject-card ${s.status === 'soon' ? 'is-locked' : ''}`}
                  style={{ ['--hue' as string]: String(s.hue) }}
                  onClick={() => openSubject(s)}
                >
                  <span className="subject-card__icon" />
                  <span className="subject-card__title">{tr(s.title, lang)}</span>
                  {s.status === 'soon' ? (
                    <span className="badge">🔒 {t('catalog.coming')}</span>
                  ) : (
                    <span className="muted">
                      {subjectModelCount(catalog!, s.key)} {t('catalog.models')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}

        {catalog !== undefined && groups.length === 0 && <p className="muted">{t('catalog.empty')}</p>}
      </div>
    </div>
  );
}
