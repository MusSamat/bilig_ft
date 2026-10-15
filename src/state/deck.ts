/**
 * Working presentation (W-51/W-52). Kept on the device (IndexedDB) so it works
 * offline; a signed-in teacher can save it to the server (POST/PATCH
 * /presentations). Snapshot images live in the `snapshots` table and slides
 * reference them by id, like the server model (Slide.snapshotId).
 */
import { create } from 'zustand';
import type { Lang, SceneState } from '@bilig/content-model';
import type { Slide } from '@bilig/content-model/api';
import { db, nowIso, uuid, type DeckRow, type SnapshotRow } from '../lib/db';

const DECK_ID = 'current';

interface DeckState extends Omit<DeckRow, 'id'> {
  loaded: boolean;
  load(): Promise<void>;
  setMeta(meta: Partial<Pick<DeckRow, 'title' | 'topicKey' | 'lang' | 'serverId' | 'serverVersion'>>): void;
  addSlide(slide: Slide): void;
  replaceSlides(slides: Slide[]): void;
  updateSlide(id: string, patch: Partial<Slide>): void;
  moveSlide(id: string, delta: number): void;
  removeSlide(id: string): void;
  clear(): void;
  addSnapshot(input: { topicKey: string; topicVersion: string; image: string; sceneState: SceneState }): Promise<SnapshotRow>;
}

const persist = (s: DeckState) => {
  const row: DeckRow = {
    id: DECK_ID,
    topicKey: s.topicKey,
    title: s.title,
    lang: s.lang,
    slides: s.slides,
    updatedAt: s.updatedAt,
    serverId: s.serverId,
    serverVersion: s.serverVersion,
  };
  void db.decks.put(row).catch(() => undefined);
};

export const useDeck = create<DeckState>((set, get) => {
  const mutate = (patch: Partial<DeckState>) => {
    set({ ...patch, updatedAt: nowIso() });
    persist(get());
  };
  return {
    loaded: false,
    topicKey: '',
    title: '',
    lang: 'ky' as Lang,
    slides: [],
    updatedAt: nowIso(),
    async load() {
      if (get().loaded) return;
      const row = await db.decks.get(DECK_ID).catch(() => undefined);
      set({ loaded: true, ...(row ? { ...row } : {}) });
    },
    setMeta: (meta) => mutate(meta),
    addSlide: (slide) => mutate({ slides: [...get().slides, slide] }),
    replaceSlides: (slides) => mutate({ slides }),
    updateSlide: (id, patch) =>
      mutate({ slides: get().slides.map((s) => (s.id === id ? ({ ...s, ...patch } as Slide) : s)) }),
    moveSlide(id, delta) {
      const slides = [...get().slides];
      const i = slides.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= slides.length) return;
      [slides[i], slides[j]] = [slides[j], slides[i]];
      mutate({ slides });
    },
    removeSlide: (id) => mutate({ slides: get().slides.filter((s) => s.id !== id) }),
    clear: () => mutate({ slides: [], title: '', serverId: undefined, serverVersion: undefined }),
    async addSnapshot(input) {
      const row: SnapshotRow = { id: uuid(), createdAt: nowIso(), ...input };
      await db.snapshots.put(row).catch(() => undefined);
      return row;
    },
  };
});

export const newSlideId = (): string => uuid();
