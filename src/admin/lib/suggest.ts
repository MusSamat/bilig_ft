/** Key suggestions for reference fields (datalists), from the first page of each dictionary. */
import { t as tl, type Lang, type Localized } from '@bilig/content-model';
import type { EndpointName } from '@bilig/content-model/api';
import { useApiQuery } from '../api/hooks';
import { useAdminLang } from '../i18n';
import type { Suggestion } from '../forms/registry';

type Source = 'subjects' | 'groups' | 'courses' | 'units' | 'objectives' | 'concepts' | 'processes' | 'items';

const ENDPOINT: Record<Source, EndpointName> = {
  subjects: 'adminSubjectList',
  groups: 'adminGroupList',
  courses: 'adminCourseList',
  units: 'adminUnitList',
  objectives: 'adminObjectiveList',
  concepts: 'adminConceptList',
  processes: 'adminProcessList',
  items: 'adminItemList',
};

/** Which form field keys reference which dictionary. */
const FIELDS: Record<Source, string[]> = {
  subjects: ['subjectKey', 'subjects'],
  groups: ['group'],
  courses: ['courseKey'],
  units: ['unitKey'],
  objectives: ['objectiveKeys'],
  concepts: ['related', 'conceptKey', 'targetConceptKey', 'focus', 'isolate', 'hide', 'conceptKeys', 'overrides.$key', 'expectConcepts'],
  processes: ['processKeys'],
  items: ['itemKeys'],
};

interface Rec {
  data: { key: string; title?: Localized; text?: Localized; code?: string; prompt?: Localized; misconceptions?: { key: string; text: Localized }[] };
}

function useSource(src: Source, enabled: boolean) {
  return useApiQuery(ENDPOINT[src], { query: { limit: 100 } } as never, { enabled, staleTime: 60_000 });
}

const label = (r: Rec, lang: Lang) => {
  const d = r.data;
  const text = tl(d.title ?? d.text ?? d.prompt, lang);
  return d.code ? `${d.code} · ${text}` : text;
};

export function useSuggestions(sources: readonly Source[]): Record<string, Suggestion[]> {
  const lang = useAdminLang((s) => s.lang);
  const all: Source[] = ['subjects', 'groups', 'courses', 'units', 'objectives', 'concepts', 'processes', 'items'];
  const queries = all.map((s) => [s, useSource(s, sources.includes(s))] as const); // fixed order of hooks
  const out: Record<string, Suggestion[]> = {};
  for (const [src, q] of queries) {
    const items = ((q.data as { items?: Rec[] } | undefined)?.items ?? []) as Rec[];
    if (!sources.includes(src) || !items.length) continue;
    const list = items.map((r) => ({ value: r.data.key, label: label(r, lang) }));
    for (const f of FIELDS[src]) out[f] = list;
    if (src === 'concepts') {
      out.misconceptionKey = items.flatMap((r) => (r.data.misconceptions ?? []).map((m) => ({ value: m.key, label: `${r.data.key}: ${tl(m.text, lang)}` })));
    }
  }
  return out;
}
