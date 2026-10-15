/**
 * Deterministic presentation template (W-52, works offline): a title slide,
 * one slide per structure (text + the latest snapshot focused on it), and a
 * process slide per process (equation + steps). Same package + snapshots +
 * language → same slides (ids derived from keys).
 */
import { t as tr, topicConcepts, type ContentPackage, type Lang } from '@bilig/content-model';
import type { Slide } from '@bilig/content-model/api';
import { texToText } from '../lib/formula';

export interface SnapshotRef {
  id: string;
  focus?: string;
  createdAt: string;
}

export function templateSlides(pkg: ContentPackage, lang: Lang, snapshots: readonly SnapshotRef[] = []): Slide[] {
  const { topic, subject } = pkg;
  const latestFor = (key: string) =>
    [...snapshots].filter((s) => s.focus === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;
  const subtitle = [topic.classification ? tr(topic.classification, lang) : '', tr(subject.title, lang)].filter(Boolean).join(' · ');
  const slides: Slide[] = [
    {
      kind: 'title',
      id: `title-${topic.key}`,
      title: tr(topic.title, lang) + (topic.formula ? `, ${texToText(topic.formula)}` : ''),
      subtitle,
      notes: tr(topic.goal, lang),
    },
  ];
  for (const c of topicConcepts(pkg)) {
    const snapshotId = latestFor(c.key);
    slides.push({
      kind: 'concept',
      id: `concept-${c.key}`,
      conceptKey: c.key,
      title: tr(c.title, lang),
      text: [tr(c.description, lang), c.funFact ? tr(c.funFact, lang) : ''].filter(Boolean).join('\n'),
      ...(snapshotId ? { snapshotId } : {}),
    });
  }
  for (const key of topic.activities.processKeys) {
    const p = pkg.processes.find((x) => x.key === key);
    if (!p) continue;
    slides.push({
      kind: 'process',
      id: `process-${p.key}`,
      processKey: p.key,
      title: tr(p.title, lang),
      ...(p.equation ? { equation: texToText(p.equation) } : {}),
      steps: p.steps.map((s) => tr(s.title, lang) + (s.result ? ` — ${tr(s.result, lang)}` : '')),
    });
  }
  return slides;
}
