/**
 * The topic's ready-made presentation (contract 0.6.0 `topicDeck`,
 * GET /topics/:key/deck?lang=&format=pptx|pdf): built on the server from the
 * published package, so the teacher downloads it without any work. Binary —
 * the file name comes from Content-Disposition.
 */
import type { Lang } from '@bilig/content-model';
import type { TopicDeckQuery } from '@bilig/content-model/api';
import { rawCall } from '../api/client';
import { readDownload, type Download } from '../lib/download';

export type TopicDeckFormat = TopicDeckQuery['format'];

export const DECK_MEDIA: Record<TopicDeckFormat, string> = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

export async function fetchTopicDeck(topicKey: string, lang: Lang, format: TopicDeckFormat): Promise<Download> {
  const res = await rawCall('topicDeck', {
    params: { key: topicKey },
    query: { lang, format },
    headers: { Accept: `${DECK_MEDIA[format]}, application/problem+json` },
  });
  return readDownload(res, `${topicKey}-${lang}.${format}`);
}
