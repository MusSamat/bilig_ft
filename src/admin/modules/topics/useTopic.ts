/** Topic row + latest version document loader shared by the topic, tour and comparison editors. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TopicSchema, type Topic } from '@bilig/content-model';
import type { AdminTopicDetail } from '@bilig/content-model/api';
import { defaultFor } from '../../forms/zod-utils';
import { api } from '../../api/session';

export function emptyTopicDoc(detail: Pick<AdminTopicDetail, 'key' | 'unitKey'>): Topic {
  const base = defaultFor(TopicSchema) as Topic;
  return { ...base, key: detail.key, unitKey: detail.unitKey, status: 'draft', overrides: {}, samples: [], objectiveKeys: [], conceptKeys: [], activities: { processKeys: [] } };
}

export interface TopicState {
  detail: AdminTopicDetail;
  doc: Topic;
}

export async function fetchTopicState(id: string): Promise<TopicState> {
  const detail = await api.call('adminTopicGet', { params: { id } });
  const doc = detail.latestVersion ? (await api.call('adminTopicVersionGet', { params: { id, version: detail.latestVersion } })).doc : emptyTopicDoc(detail);
  return { detail, doc };
}

export const topicStateKey = (id: string) => ['topicState', id] as const;

export function useTopicState(id: string) {
  return useQuery({ queryKey: topicStateKey(id), queryFn: () => fetchTopicState(id) });
}

/** Save a new draft version (If-Match = topic row version) and return the fresh state. */
export async function saveTopicDoc(id: string, doc: Topic, version: number, basedOn: string | undefined, message?: string): Promise<TopicState> {
  await api.call('adminTopicVersionCreate', { params: { id }, body: { doc: { ...doc, status: 'draft' }, ...(basedOn ? { basedOn } : {}), ...(message ? { message } : {}) }, ifMatch: version });
  return fetchTopicState(id);
}

export function useInvalidateTopic() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: topicStateKey(id) });
    void qc.invalidateQueries({ queryKey: ['adminTopicList'] });
    void qc.invalidateQueries({ queryKey: ['adminTopicGet'] });
  };
}
