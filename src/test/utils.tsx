/** Test harness: providers, router, a topic context from the mock content, viewer init. */
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { topicConcepts, type ContentPackage } from '@bilig/content-model';
import { resolveModes, topicProgress } from '@bilig/scene-core';
import { GUEST, grantedPermissions } from '@bilig/permissions';
import i18n from '../i18n';
import { useSession } from '../api/session';
import { tokens } from '../api/tokens';
import { packageByKey } from '../mocks/data';
import { useViewer } from '../state/viewer';
import { TopicContext, type TopicCtx } from '../topic/context';

export function resetSession(): void {
  tokens.set(null);
  useSession.setState({ status: 'guest', me: null, permissions: grantedPermissions(GUEST) });
}

export function LocationProbe(): JSX.Element {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

export function renderRoutes(path: string, routes: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function topicPkg(key: string): ContentPackage {
  const p = packageByKey(key);
  if (!p) throw new Error(`no mock package ${key}`);
  return p;
}

/** Render topic components with a real package, viewer store initialised as the page would. */
export function renderTopic(ui: ReactNode, opts: { topic?: string; pkg?: ContentPackage; lang?: 'ky' | 'ru' | 'en'; lesson?: boolean; path?: string } = {}) {
  const pkg = opts.pkg ?? topicPkg(opts.topic ?? 'water');
  const lang = opts.lang ?? 'en';
  void i18n.changeLanguage(lang);
  const concepts = topicConcepts(pkg);
  useViewer.getState().initTopic(pkg.topic, concepts, resolveModes([], pkg.topic.scene.modes), {});
  const visited: string[] = [];
  const ctx: TopicCtx = {
    pkg,
    concepts,
    filesBaseUrl: 'http://localhost/mock-files/x/',
    lesson: !!opts.lesson,
    progress: {
      state: { visitedConcepts: visited, completedActivities: [] },
      summary: topicProgress(pkg.topic, { visitedConcepts: visited, completedActivities: [] }),
      source: 'local',
      visit: () => {},
      complete: () => {},
    },
  };
  const path = opts.path ?? `/${lang}/${pkg.subject.key}/${pkg.topic.key}`;
  const utils = renderRoutes(path, <Route path="*" element={<TopicContext.Provider value={ctx}>{ui}</TopicContext.Provider>} />);
  return { ...utils, pkg, concepts };
}
