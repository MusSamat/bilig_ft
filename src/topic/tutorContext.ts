/**
 * The context envelope (contract 0.4.0): what is on screen when the teacher
 * asks — lesson / process / explore, the process step, the topic's own
 * sample. The server resolves the keys against the package, so a short
 * follow-up («а сколько там атомов?») is understood without restating it.
 */
import type { TutorContext } from '@bilig/content-model/api';
import { player } from '@bilig/scene-core';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

export function useTutorContext(): TutorContext {
  const { pkg, lesson } = useTopic();
  const process = useViewer((s) => s.process);
  const lessonStep = useViewer((s) => s.lessonStep);
  const sample = pkg.topic.samples.find((s) => (s.topicKey ?? pkg.topic.key) === pkg.topic.key);
  return {
    mode: lesson ? 'lesson' : process ? 'process' : 'explore',
    ...(sample ? { sampleKey: sample.key } : {}),
    ...(process ? { processKey: process.key, stepIndex: player.currentStep(process.state) } : lesson ? { stepIndex: lessonStep } : {}),
  };
}
