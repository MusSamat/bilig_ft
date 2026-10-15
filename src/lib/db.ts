/**
 * Local device storage (IndexedDB via Dexie): guest progress (W-11), recent
 * topics (W-54), snapshots (W-51) and the draft presentation (W-52).
 * (Offline downloads and the result sync queue are out of scope for now.)
 */
import Dexie, { type Table } from 'dexie';
import type { Localized, SceneState } from '@bilig/content-model';
import type { Slide } from '@bilig/content-model/api';

export interface ProgressRow {
  topicKey: string;
  visitedConcepts: string[];
  completedActivities: string[];
  updatedAt: string;
}

export interface RecentRow {
  topicKey: string;
  /** Path without the language segment (`/bio/g7/animal-cell`). */
  path: string;
  title: Localized;
  subjectKey: string;
  hue: number;
  openedAt: string;
}

export interface SnapshotRow {
  id: string;
  topicKey: string;
  topicVersion: string;
  image: string;
  sceneState: SceneState;
  createdAt: string;
  /** Server id once uploaded (POST /snapshots). */
  serverId?: string;
}

export interface DeckRow {
  id: string;
  topicKey: string;
  title: string;
  lang: string;
  slides: Slide[];
  updatedAt: string;
  serverId?: string;
  serverVersion?: number;
}

class BiligDb extends Dexie {
  progress!: Table<ProgressRow, string>;
  recent!: Table<RecentRow, string>;
  snapshots!: Table<SnapshotRow, string>;
  decks!: Table<DeckRow, string>;

  constructor() {
    super('bilig');
    this.version(1).stores({
      progress: 'topicKey',
      recent: 'topicKey, openedAt',
      snapshots: 'id, topicKey, createdAt',
      decks: 'id, topicKey, updatedAt',
    });
  }
}

export const db = new BiligDb();

/** UUID v4 (crypto when available). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowIso = (): string => new Date().toISOString();
