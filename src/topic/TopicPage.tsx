/**
 * Topic page (TZ W-10…W-55): header, status tiles, samples, 3D stage with the
 * mode panel and toolbar, structure tree, concept card with examples,
 * assistant, activities (processes, comparison, quiz) and the lesson mode.
 * Everything is built from the content package and the scene plugin — no
 * subject or topic names in code.
 */
import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { topicConcepts } from '@bilig/content-model';
import { registry } from '@bilig/scene-core';
import { useCatalog, useTopicPackage } from '../api/content';
import { isApiError } from '../api/client';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { db, nowIso } from '../lib/db';
import { useLang } from '../lib/hooks';
import { useTopicProgress } from '../lib/progress';
import { stripLang } from '../lib/urls';
import { ensurePlugins, usePluginsReady } from '../scene/registry';
import { useUi } from '../state/ui';
import { useViewer } from '../state/viewer';
import { Activities } from './Activities';
import { AssistantPanel } from './AssistantPanel';
import { ConceptCard } from './ConceptCard';
import { TopicContext, type TopicCtx } from './context';
import { LessonPanel } from './LessonPanel';
import { ModePanel } from './ModePanel';
import { SampleStrip } from './SampleStrip';
import { Stage } from './Stage';
import { StatusTiles } from './StatusTiles';
import { StructureTree } from './StructureTree';
import { TopicHeader } from './TopicHeader';
import { useTopicUrlSync } from './useTopicUrlSync';

export default function TopicPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { topic: topicKey } = useParams();
  const [params] = useSearchParams();
  const { data, isLoading, error, refetch } = useTopicPackage(topicKey);
  const { data: catalog } = useCatalog();
  const pluginsReady = usePluginsReady((s) => s.ready);
  const setContext = useUi((s) => s.setContext);
  const initTopic = useViewer((s) => s.initTopic);
  const openProcess = useViewer((s) => s.openProcess);
  const setLessonStep = useViewer((s) => s.setLessonStep);
  const viewerTopic = useViewer((s) => s.topicKey);
  const selected = useViewer((s) => s.selected);

  const pkg = data?.pkg;
  const concepts = useMemo(() => (pkg ? topicConcepts(pkg) : []), [pkg]);
  const progress = useTopicProgress(pkg?.topic);
  const lesson = params.get('view') === 'lesson';

  useEffect(() => void ensurePlugins(), []);

  // Header context + subject hue (W-01, W-03).
  useEffect(() => {
    if (pkg) setContext({ subject: pkg.subject, topicTitle: pkg.topic.title });
    return () => setContext(null);
  }, [pkg, setContext]);

  // Initialise the viewer from the URL once the package and the plugins are ready (W-05, W-23).
  const ready = !!pkg && pluginsReady && viewerTopic === pkg.topic.key;
  useEffect(() => {
    if (!pkg || !pluginsReady) return;
    const defs = registry.modesFor(pkg.topic.scene);
    initTopic(pkg.topic, concepts, defs, {
      focus: params.get('focus'),
      modeTokens: params.get('mode')?.split(',').filter(Boolean),
    });
    const pKey = params.get('process');
    const proc = pkg.processes.find((p) => p.key === pKey && pkg.topic.activities.processKeys.includes(p.key));
    const step = Number(params.get('step'));
    if (proc) openProcess(proc.key, proc.steps, Number.isFinite(step) ? step : 0);
    const ls = Number(params.get('lesson'));
    if (Number.isFinite(ls) && ls > 0) setLessonStep(ls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, pluginsReady, concepts]);

  useTopicUrlSync({ ready, processes: pkg?.processes ?? [], lesson });

  // «Изучено N из M» (W-11).
  useEffect(() => {
    if (ready && selected) progress.visit(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected]);

  // Recent topics (W-54).
  useEffect(() => {
    if (!pkg) return;
    void db.recent
      .put({ topicKey: pkg.topic.key, path: stripLang(window.location.pathname), title: pkg.topic.title, subjectKey: pkg.subject.key, hue: pkg.subject.hue, openedAt: nowIso() })
      .catch(() => undefined);
  }, [pkg]);

  if (isLoading || (!data && !error)) {
    return (
      <div className="page" aria-busy="true">
        <p className="muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (error || !data || !pkg) {
    const notFound = isApiError(error) && error.status === 404;
    return (
      <div className="page narrow stack">
        <h1>{notFound ? t('topic.notFound') : t('topic.loadError')}</h1>
        {isApiError(error) && !notFound && <p className="error-text">{t(error.i18nKey, { defaultValue: t('common.error') })}</p>}
        <div className="row">
          {!notFound && (
            <button type="button" className="btn btn--primary" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          )}
          <Link className="btn" to={`/${lang}`}>
            {t('notFound.home')}
          </Link>
        </div>
      </div>
    );
  }

  const ctx: TopicCtx = {
    pkg,
    concepts,
    filesBaseUrl: data.filesBaseUrl,
    progress,
    lesson,
    assignmentId: params.get('assignment') ?? undefined,
  };

  const fallbackCrumbs = [
    { kind: 'subject' as const, key: pkg.subject.key, title: pkg.subject.title },
    ...(pkg.course ? [{ kind: 'course' as const, key: pkg.course.key, title: pkg.course.title }] : []),
    ...(pkg.unit ? [{ kind: 'unit' as const, key: pkg.unit.key, title: pkg.unit.title }] : []),
    { kind: 'topic' as const, key: pkg.topic.key, title: pkg.topic.title },
  ];

  return (
    <TopicContext.Provider value={ctx}>
      <div className={`page${lesson ? ' is-lesson' : ''}`}>
        <Breadcrumbs catalog={catalog} topicKey={pkg.topic.key} fallback={fallbackCrumbs} />
        <TopicHeader />
        {!lesson && <StatusTiles />}
        <div className="topic-layout">
          <div className="stage">
            <ModePanel ready={ready} />
            <Stage ready={ready} />
            {lesson ? <LessonPanel ready={ready} /> : <SampleStrip />}
            <Activities ready={ready} />
          </div>
          <aside className="topic-layout__aside stack" aria-label={t('card.region')}>
            <StructureTree />
            <ConceptCard />
            {!lesson && <AssistantPanel />}
          </aside>
        </div>
      </div>
    </TopicContext.Provider>
  );
}
