/**
 * v0.5.0 stage samples: a sample with a `scene` can be put on the stage from
 * the specimen ribbon or by a tour step. The stage then renders
 * `sceneForSample(topic.scene, sample)`; the topic's default specimen (the one
 * the ribbon marks as current on load) stands for the topic scene itself.
 */
import { sceneForSample, type Sample, type SceneSpec, type Topic } from '@bilig/content-model';
import { registry } from '@bilig/scene-core';
import { useViewer } from '../state/viewer';

/** The specimen the topic page shows by default: the sample pointing at this topic, else the first one without a topic of its own. */
export function defaultSampleKey(topic: Pick<Topic, 'key' | 'samples'>): string | undefined {
  return (topic.samples.find((s) => s.topicKey === topic.key) ?? topic.samples.find((s) => !s.topicKey))?.key;
}

/** The sample object behind a stage sample key (null = the topic scene). */
export function stageSample(topic: Pick<Topic, 'samples'>, key: string | null): Sample | null {
  return key ? topic.samples.find((s) => s.key === key) ?? null : null;
}

/** Whether the ribbon puts this sample on the stage (vs. plain card or link to its topic). */
export function canStage(topic: Pick<Topic, 'key' | 'samples'>, sample: Sample): boolean {
  return !!sample.scene || sample.key === defaultSampleKey(topic);
}

/** The scene the stage renders for the stage sample. */
export function stageScene(topic: Pick<Topic, 'scene' | 'samples'>, key: string | null): SceneSpec {
  return sceneForSample(topic.scene, stageSample(topic, key));
}

/** Put a sample on the stage (`null` or the default specimen = the topic scene). Unknown keys restore the topic scene. */
export function showStageSample(topic: Topic, key: string | null): void {
  const sample = key && key !== defaultSampleKey(topic) ? stageSample(topic, key) : null;
  useViewer.getState().showSample(sample, registry.modesFor(sceneForSample(topic.scene, sample)));
}
