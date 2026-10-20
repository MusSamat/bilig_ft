/**
 * Topic actions shared by the toolbar and the lesson: the snapshot (W-51)
 * saves the picture of the stage as a PNG file — presentations themselves are
 * ready-made per topic (the topic toolbar), not assembled by hand.
 */
import { gradeSegment, t as tr, type ContentPackage, type Lang, type SceneState } from '@bilig/content-model';
import { encodeModes, player } from '@bilig/scene-core';
import { saveFile } from '../lib/download';
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

/** «Ылдамдык — Машина.png»: the topic, then the focused part when there is one. */
const snapshotName = (pkg: ContentPackage, lang: Lang, focusTitle?: string): string =>
  `${[tr(pkg.topic.title, lang), focusTitle].filter(Boolean).join(' — ').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 100)}.png`;

/** The stage picture as a PNG blob (the capture may be WebP or PNG). */
async function toPng(dataUri: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUri;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

/** Save the current stage as a picture file (camera button). */
export async function takeSnapshot(pkg: ContentPackage, lang: Lang): Promise<boolean> {
  const image = sceneHandle.get()?.capture();
  if (!image) {
    toast({ key: 'scene.snapshotFailed', kind: 'error' });
    return false;
  }
  try {
    const focus = pkg.concepts.find((c) => c.key === useViewer.getState().selected);
    saveFile({ blob: await toPng(image), filename: snapshotName(pkg, lang, focus ? tr(focus.title, lang) : undefined) });
    toast({ key: 'scene.snapshotSaved', kind: 'success' });
    return true;
  } catch {
    toast({ key: 'scene.snapshotFailed', kind: 'error' });
    return false;
  }
}
