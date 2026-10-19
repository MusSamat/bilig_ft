/**
 * Topic actions shared by the toolbar, card and lesson: snapshot (W-51) and
 * «В презентацию» (W-31). A snapshot keeps BOTH the image and the SceneState,
 * so a slide can be reopened live.
 */
import { gradeSegment, t as tr, type ContentPackage, type Lang, type ResolvedConcept, type SceneState } from '@bilig/content-model';
import { encodeModes, makeSnapshot, player } from '@bilig/scene-core';
import { api } from '../api/client';
import { useSession } from '../api/session';
import { db } from '../lib/db';
import { newSlideId, useDeck } from '../state/deck';
import { toast } from '../state/ui';
import { sceneHandle, useViewer } from '../state/viewer';

/** Current live SceneState (W-05 fields + camera for snapshots). */
export function currentSceneState(pkg: ContentPackage, lang: Lang, lesson: boolean): SceneState {
  const v = useViewer.getState();
  const modes = encodeModes(v.modes, v.modeDefs);
  return {
    lang,
    subjectKey: pkg.subject.key,
    ...(pkg.course ? { grade: gradeSegment(pkg.course.grade) } : {}),
    topicKey: pkg.topic.key,
    ...(v.selected ? { focus: v.selected } : {}),
    ...(modes.length ? { modes } : {}),
    ...(v.process ? { process: v.process.key, step: Math.max(0, player.currentStep(v.process.state)) } : {}),
    ...(lesson ? { view: 'lesson' as const, lessonStep: v.lessonStep } : { view: 'study' as const }),
  };
}

function ensureDeckFor(pkg: ContentPackage, lang: Lang): void {
  const deck = useDeck.getState();
  if (!deck.slides.length || !deck.topicKey) deck.setMeta({ topicKey: pkg.topic.key, title: tr(pkg.topic.title, lang), lang });
}

const openDeckAction = (navigate: (to: string) => void, lang: Lang) => ({ key: 'scene.openDeck', onClick: () => navigate(`/${lang}/presentation`) });

export async function takeSnapshot(pkg: ContentPackage, lang: Lang, lesson: boolean, navigate: (to: string) => void): Promise<boolean> {
  const handle = sceneHandle.get();
  const image = handle?.capture();
  if (!image) {
    toast({ key: 'scene.snapshotFailed', kind: 'error' });
    return false;
  }
  const snap = makeSnapshot(currentSceneState(pkg, lang, lesson), image, handle?.camera() ?? undefined);
  const row = await useDeck.getState().addSnapshot({ topicKey: pkg.topic.key, topicVersion: pkg.manifest.version, image: snap.image, sceneState: snap.sceneState });
  ensureDeckFor(pkg, lang);
  const v = useViewer.getState();
  const focus = pkg.concepts.find((c) => c.key === v.selected);
  useDeck.getState().addSlide({ kind: 'snapshot', id: newSlideId(), snapshotId: row.id, caption: tr(focus?.title ?? pkg.topic.title, lang) });
  toast({ key: 'scene.snapshotAdded', kind: 'success', action: openDeckAction(navigate, lang) });
  // Signed-in users also store the snapshot on the server (POST /snapshots).
  if (useSession.getState().status === 'authed' && /^data:image\/(webp|png|jpeg);base64,/.test(snap.image)) {
    void api('snapshotCreate', { body: { topicKey: pkg.topic.key, topicVersion: pkg.manifest.version, image: snap.image, sceneState: snap.sceneState } })
      .then((res) => db.snapshots.update(row.id, { serverId: res.id }))
      .catch(() => undefined);
  }
  return true;
}

export function addConceptToDeck(pkg: ContentPackage, concept: ResolvedConcept, lang: Lang, navigate: (to: string) => void): void {
  ensureDeckFor(pkg, lang);
  useDeck.getState().addSlide({ kind: 'concept', id: newSlideId(), conceptKey: concept.key, title: tr(concept.title, lang), text: tr(concept.description, lang) });
  toast({ key: 'card.addedToDeck', params: { name: tr(concept.title, lang) }, kind: 'success', action: openDeckAction(navigate, lang) });
}
