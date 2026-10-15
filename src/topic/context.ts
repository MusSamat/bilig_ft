/** Topic-wide data shared by the topic page components. */
import { createContext, useContext } from 'react';
import type { ContentPackage, ResolvedConcept } from '@bilig/content-model';
import type { TopicProgressApi } from '../lib/progress';

export interface TopicCtx {
  pkg: ContentPackage;
  concepts: ResolvedConcept[];
  /** Absolute base for package files (thumbnails, assets). */
  filesBaseUrl: string;
  progress: TopicProgressApi;
  lesson: boolean;
  /** `?assignment=` when opened from a teacher's assignment. */
  assignmentId?: string;
}

export const TopicContext = createContext<TopicCtx | null>(null);

export function useTopic(): TopicCtx {
  const v = useContext(TopicContext);
  if (!v) throw new Error('useTopic outside TopicContext');
  return v;
}

/** Resolve a package-relative file path against the files base URL. */
export const fileUrl = (base: string, path: string): string => (/^(https?:|data:|\/)/.test(path) ? path : base + path);
