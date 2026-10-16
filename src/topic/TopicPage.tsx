/**
 * Topic page (TZ W-10…W-55), Workbench layout: the hero panel (crumbs, title,
 * goal, status tiles, specimen strip), the work area (3D stage with overlaid
 * structure chips, «Вид модели» card and toolbar | inspector + tutor), the
 * processes section and the comparison + quiz row. Lesson mode (W-50) switches
 * to projector typography and hides the tutor and the quiz. Everything is
 * built from the content package and the scene plugin — no subject or topic
 * names in code.
 */
import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { topicConcepts } from '@bilig/content-model';
import { registry } from '@bilig/scene-core';
import { useCatalog, useTopicPackage } from '../api/content';
import { isApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { db, nowIso } from '../lib/db';
import { useLang } from '../lib/hooks';
import { useTopicProgress } from '../lib/progress';
import { stripLang } from '../lib/urls';
import { ensurePlugins, usePluginsReady } from '../scene/registry';
import { useUi } from '../state/ui';
import { useViewer } from '../state/viewer';
import { AssistantPanel } from './AssistantPanel';
import { ComparisonTable } from './ComparisonTable';
import { ConceptCard } from './ConceptCard';
import { TopicContext, type TopicCtx } from './context';
import { ProcessPanel } from './ProcessPanel';
import { Quiz } from './Quiz';
import { Stage } from './Stage';
import { TopicHero } from './TopicHeader';
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

  // Header context + subject hue (W-01, W-03): the hue always comes from the API.
  useEffect(() => {
    if (pkg) setContext({ subject: pkg.subject, topicTitle: pkg.topic.title, unitTitle: pkg.unit?.title, topicKey: pkg.topic.key });
    return () => setContext(null);
  }, [pkg, setContext]);

  // Projector typography (prototype html[data-mode=lesson]).
  useEffect(() => {
    document.documentElement.dataset.mode = lesson ? 'lesson' : 'study';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, [lesson]);

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

  if (isLoading || (!data && !error)) return <TopicSkeleton />;
  if (error || !data || !pkg) {
    const notFound = isApiError(error) && error.status === 404;
    return (
      <div className="wrap page--narrow">
        <section className="card stack" aria-labelledby="topic-error">
          <h1 id="topic-error" className="page-title">
            {notFound ? t('topic.notFound') : t('topic.loadError')}
          </h1>
          <div className={`state${notFound ? '' : ' state--error'}`} role={notFound ? undefined : 'alert'}>
            <Icon name={notFound ? 'search' : 'warn'} />
            <span>{notFound ? t('topic.notFoundHint') : isApiError(error) ? t(error.i18nKey, { defaultValue: t('common.error') }) : t('common.error')}</span>
            <div className="row">
              {!notFound && (
                <button type="button" className="cta" onClick={() => refetch()}>
                  <Icon name="reset" className="sm" />
                  {t('common.retry')}
                </button>
              )}
              <Link className="btn2" to={`/${lang}`}>
                <Icon name="home" className="sm" />
                {t('notFound.home')}
              </Link>
            </div>
          </div>
        </section>
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
  const a = pkg.topic.activities;
  const showCompare = !!a.comparison;
  const showQuiz = !!a.quiz && !lesson;

  return (
    <TopicContext.Provider value={ctx}>
      <div className={`wrap topic${lesson ? ' is-lesson' : ''}`}>
        <TopicHero catalog={catalog} />
        <div className="work">
          <Stage ready={ready} />
          <div className="side">
            <ConceptCard ready={ready} />
            {!lesson && <AssistantPanel />}
          </div>
        </div>
        {a.processKeys.length > 0 && <ProcessPanel ready={ready} />}
        {(showCompare || showQuiz) && (
          <div className={`duo${showCompare && showQuiz ? '' : ' duo--single'}`}>
            {showCompare && <ComparisonTable />}
            {showQuiz && <Quiz ready={ready} />}
          </div>
        )}
      </div>
    </TopicContext.Provider>
  );
}

/** Reserved-size skeleton: the same hero / stage / side geometry, so nothing jumps when data and 3D arrive. */
function TopicSkeleton(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="wrap topic" aria-busy="true" aria-label={t('common.loading')}>
      <section className="hero panel glass">
        <div className="stack">
          <span className="skel line" style={{ width: 220 }} />
          <span className="skel h1" />
          <span className="skel line" style={{ width: 180 }} />
          <span className="skel line" style={{ width: '90%' }} />
          <span className="skel" style={{ height: 64 }} />
        </div>
        <div className="tiles">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skel" style={{ height: 76, borderRadius: 'var(--r-lg)' }} />
          ))}
        </div>
      </section>
      <div className="work">
        <div className="stage stage--skel">
          <span className="skel" />
        </div>
        <div className="side">
          <span className="panel glass skel" style={{ height: 380 }} />
        </div>
      </div>
    </div>
  );
}
