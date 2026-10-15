/**
 * Topic progress (W-11): «изучено N из M». Signed-in users → GET/PUT
 * /progress/:topicKey (merged as a union); guests → IndexedDB. The local copy
 * is always kept so a signed-in user who goes offline loses nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Topic } from '@bilig/content-model';
import { markActivity, markVisited, mergeProgress, topicProgress, type ProgressState } from '@bilig/scene-core';
import { api } from '../api/client';
import { useSession } from '../api/session';
import { db, nowIso } from './db';

export interface TopicProgressApi {
  state: ProgressState;
  summary: ReturnType<typeof topicProgress>;
  source: 'server' | 'local';
  visit(conceptKey: string): void;
  complete(activityKey: string): void;
}

const empty = (): ProgressState => ({ visitedConcepts: [], completedActivities: [] });

export function useTopicProgress(topic: Pick<Topic, 'key' | 'conceptKeys'> | undefined): TopicProgressApi {
  const canServer = useSession((s) => s.status === 'authed' && s.permissions.includes('topic.view'));
  const [state, setState] = useState<ProgressState>(empty);
  const key = topic?.key;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState(empty());
    void (async () => {
      const local = await db.progress.get(key).catch(() => undefined);
      let merged: ProgressState = local ?? empty();
      if (alive) setState(merged);
      if (canServer) {
        try {
          const remote = await api('progressGet', { params: { topicKey: key } });
          merged = mergeProgress(merged, remote);
          if (alive) setState(merged);
        } catch {
          /* offline — local copy stays */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, canServer]);

  const save = useCallback(
    (next: ProgressState) => {
      if (!key) return;
      const row = { topicKey: key, visitedConcepts: next.visitedConcepts, completedActivities: next.completedActivities, updatedAt: next.updatedAt ?? nowIso() };
      void db.progress.put(row).catch(() => undefined);
      if (canServer) {
        void api('progressPut', { params: { topicKey: key }, body: { visitedConcepts: row.visitedConcepts, completedActivities: row.completedActivities, updatedAt: row.updatedAt } }).catch(() => undefined);
      }
    },
    [key, canServer],
  );

  const visit = useCallback(
    (conceptKey: string) =>
      setState((s) => {
        const next = markVisited(s, conceptKey, nowIso());
        if (next !== s) save(next);
        return next;
      }),
    [save],
  );
  const complete = useCallback(
    (activityKey: string) =>
      setState((s) => {
        const next = markActivity(s, activityKey, nowIso());
        if (next !== s) save(next);
        return next;
      }),
    [save],
  );

  return {
    state,
    summary: topicProgress(topic ?? { conceptKeys: [] }, state),
    source: canServer ? 'server' : 'local',
    visit,
    complete,
  };
}
