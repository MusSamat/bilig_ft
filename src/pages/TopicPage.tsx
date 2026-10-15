/**
 * Topic page: the 3D stage + concept card. Keeps the URL in sync with the
 * selected structure (TZ W-05: `?focus=bio.nucleus`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isLang, t as tr, topicConcepts, type ContentPackage } from '@bilig/content-model';
import { defaultModeState, registry, selectByKey } from '@bilig/scene-core';
import { Header } from '../components/Header';
import { CatalogModal } from '../components/CatalogModal';
import { ConceptCard } from '../components/ConceptCard';
import { ModePanel } from '../components/ModePanel';
import { SceneViewer } from '../scene/SceneViewer';
import { fetchPackage } from '../api';
import { applyTheme } from '../theme';
import { useStore } from '../store';

export function TopicPage(): JSX.Element {
  const { t } = useTranslation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const theme = useStore((s) => s.theme);
  const selectedConceptKey = useStore((s) => s.selectedConceptKey);
  const selectConcept = useStore((s) => s.selectConcept);
  const setModes = useStore((s) => s.setModes);

  const [pkg, setPkg] = useState<ContentPackage | null | undefined>(undefined);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const topicKey = params.topic;

  useEffect(() => {
    if (isLang(params.lang) && params.lang !== lang) setLang(params.lang);
  }, [params.lang, lang, setLang]);

  useEffect(() => {
    let active = true;
    setPkg(undefined);
    if (topicKey) void fetchPackage(topicKey).then((p) => active && setPkg(p));
    return () => {
      active = false;
    };
  }, [topicKey]);

  const concepts = useMemo(() => (pkg ? topicConcepts(pkg) : []), [pkg]);

  useEffect(() => {
    if (pkg) applyTheme(pkg.subject.hue, theme);
  }, [pkg, theme]);

  // On package load: default modes (W-23) and selection from ?focus (W-05).
  useEffect(() => {
    if (!pkg) return;
    setModes(defaultModeState(registry.modesFor(pkg.topic.scene)));
    selectConcept(selectByKey(concepts, searchParams.get('focus')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedConceptKey) next.set('focus', selectedConceptKey);
    else next.delete('focus');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConceptKey]);

  if (pkg === undefined) return <div className="app center">{t('common.loading')}</div>;
  if (!pkg) return <div className="app center">{t('catalog.empty')}</div>;
  const { topic, subject } = pkg;

  return (
    <div className="app">
      <Header subjectTitle={tr(subject.title, lang)} onOpenCatalog={() => setCatalogOpen(true)} />
      {catalogOpen && <CatalogModal onClose={() => setCatalogOpen(false)} />}

      <div className="topic-layout">
        <main className="stage">
          <nav className="crumbs">
            <span>{tr(subject.title, lang)}</span>
            {pkg.unit && (
              <>
                <span className="crumbs__sep">›</span>
                <span>{tr(pkg.unit.title, lang)}</span>
              </>
            )}
            <span className="crumbs__sep">›</span>
            <span>{tr(topic.title, lang)}</span>
          </nav>
          <p className="goal">
            <strong>{t('topic.goal')}:</strong> {tr(topic.goal, lang)}
          </p>
          <SceneViewer topic={topic} concepts={concepts} />
          <ModePanel topic={topic} />
        </main>
        <ConceptCard pkg={pkg} concepts={concepts} />
      </div>
    </div>
  );
}
