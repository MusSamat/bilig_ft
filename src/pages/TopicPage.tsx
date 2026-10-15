/**
 * Topic page: the 3D stage + concept card. Keeps the URL in sync with the
 * selected structure (TZ W-05: `?focus=bio.nucleus`) so a link round-trips a
 * class/presentation back to the exact view.
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ContentPackage, Lang } from '@bilig/content-model';
import { LANGS, t as tr } from '@bilig/content-model';
import { Header } from '../components/Header';
import { CatalogModal } from '../components/CatalogModal';
import { ConceptCard } from '../components/ConceptCard';
import { ModePanel } from '../components/ModePanel';
import { SceneViewer } from '../scene/SceneViewer';
import { fetchPackage } from '../api';
import { applyTheme } from '../theme';
import { useStore } from '../store';

const isLang = (v: string | undefined): v is Lang =>
  !!v && (LANGS as string[]).includes(v);

export function TopicPage(): JSX.Element {
  const { t } = useTranslation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const theme = useStore((s) => s.theme);
  const selectedConceptId = useStore((s) => s.selectedConceptId);
  const selectConcept = useStore((s) => s.selectConcept);

  const [pkg, setPkg] = useState<ContentPackage | null | undefined>(undefined);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const subjectSlug = params.subject;
  const topicSlug = params.topic;

  // Sync language from the URL (TZ W-05).
  useEffect(() => {
    if (isLang(params.lang) && params.lang !== lang) setLang(params.lang);
  }, [params.lang, lang, setLang]);

  // Load the content package for this subject.
  useEffect(() => {
    let active = true;
    if (subjectSlug) void fetchPackage(subjectSlug).then((p) => active && setPkg(p));
    return () => {
      active = false;
    };
  }, [subjectSlug]);

  const topic = pkg?.topics.find((tp) => tp.slug === topicSlug);

  // Apply the subject's hue tokens (TZ W-03).
  useEffect(() => {
    if (pkg) applyTheme(pkg.subject.hue, theme);
  }, [pkg, theme]);

  // Initialize selection from ?focus on topic load.
  useEffect(() => {
    selectConcept(searchParams.get('focus'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicSlug]);

  // Reflect selection back into the URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedConceptId) next.set('focus', selectedConceptId);
    else next.delete('focus');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConceptId]);

  if (pkg === undefined) {
    return <div className="app center">{t('common.loading')}</div>;
  }
  if (!pkg || !topic) {
    return <div className="app center">{t('catalog.empty')}</div>;
  }

  return (
    <div className="app">
      <Header
        subjectTitle={tr(pkg.subject.title, lang)}
        onOpenCatalog={() => setCatalogOpen(true)}
      />
      {catalogOpen && <CatalogModal onClose={() => setCatalogOpen(false)} />}

      <div className="topic-layout">
        <main className="stage">
          <nav className="crumbs">
            <span>{tr(pkg.subject.title, lang)}</span>
            <span className="crumbs__sep">›</span>
            <span>{tr(topic.title, lang)}</span>
          </nav>
          {topic.goal && (
            <p className="goal">
              <strong>{t('topic.goal')}:</strong> {tr(topic.goal, lang)}
            </p>
          )}
          <SceneViewer topic={topic} />
          <ModePanel topic={topic} />
        </main>
        <ConceptCard topic={topic} />
      </div>
    </div>
  );
}
