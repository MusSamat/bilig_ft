import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { L, topicConcepts, type ContentPackage, type Sample } from '@bilig/content-model';
import { registry, type ModeDef, type ScenePlugin } from '@bilig/scene-core';
import { renderTopic, topicPkg } from '../test/utils';
import { setWebGLAvailable } from '../scene/webgl';
import { useViewer } from '../state/viewer';
import { LessonPanel } from './LessonPanel';
import { SampleStrip } from './SampleStrip';
import { Stage } from './Stage';
import { defaultSampleKey, showStageSample, stageScene } from './stageSample';

// The 3D viewer is replaced by a probe that records its props and how often it mounts.
const viewer = vi.hoisted(() => ({ props: [] as Record<string, unknown>[], mounts: 0 }));
vi.mock('../scene/SceneViewer', async () => {
  const { useEffect } = await import('react');
  return {
    default: function SceneViewerProbe(props: Record<string, unknown>) {
      viewer.props.push(props);
      useEffect(() => {
        viewer.mounts += 1;
      }, []);
      return <div data-testid="scene" />;
    },
  };
});

const last = () => viewer.props[viewer.props.length - 1] as { topic: ContentPackage['topic']; stageSample: string | null; sampleCamera: unknown; stepCamera: unknown };

/** A molecule stand-in: a rep group, and a `shells` toggle the params can switch off by default. */
const fakeMolecule: ScenePlugin = {
  type: 'molecule',
  modes: (scene): ModeDef[] => [
    { id: 'ball-stick', group: 'rep', label: L('a', 'a', 'a'), default: true },
    { id: 'spacefill', group: 'rep', label: L('b', 'b', 'b') },
    { id: 'shells', label: L('c', 'c', 'c'), default: (scene.params as { shells?: boolean } | undefined)?.shells !== false },
  ],
  Component: () => null,
};

const ICE_CAMERA = { position: [3, 3, 3] as [number, number, number], target: [0, 0.5, 0] as [number, number, number], fov: 40 };
const LINK_CAMERA = { position: [0, 0, 9] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 45 };

/** The mock water package with v0.5.0 sample scenes and a tour that puts `ice` on the stage. */
function fixture(): ContentPackage {
  const base = topicPkg('water');
  const pkg = structuredClone(base);
  const t = pkg.topic;
  const scenes: Record<string, Sample['scene']> = {
    ice: { params: { formula: 'ICE', shells: false }, camera: ICE_CAMERA, modes: { rep: 'spacefill' } },
    ch4: { camera: LINK_CAMERA },
  };
  t.samples = t.samples.map((s) => (scenes[s.key] ? { ...s, scene: scenes[s.key] } : s));
  const steps = t.activities.tour!.steps;
  steps[1] = { ...steps[1]!, sample: 'ice', modes: { labels: true } };
  steps[2] = { ...steps[2]!, sample: undefined };
  return pkg;
}

beforeAll(() => registry.register(fakeMolecule));
beforeEach(() => {
  viewer.props = [];
  viewer.mounts = 0;
  setWebGLAvailable(true);
});
afterEach(() => setWebGLAvailable(null));

/** Like the topic page: the store starts with the topic scene's mode definitions. */
function init(pkg: ContentPackage) {
  useViewer.getState().initTopic(pkg.topic, topicConcepts(pkg), registry.modesFor(pkg.topic.scene), {});
}

describe('stage samples (v0.5.0)', () => {
  it('helpers: default specimen, merged scene, unknown keys restore the topic scene', () => {
    const pkg = fixture();
    expect(defaultSampleKey(pkg.topic)).toBe('h2o');
    expect(stageScene(pkg.topic, null)).toBe(pkg.topic.scene);
    const ice = stageScene(pkg.topic, 'ice');
    expect(ice.params).toMatchObject({ formula: 'ICE', shells: false, atoms: (pkg.topic.scene.params as { atoms: unknown }).atoms });
    expect(ice.camera).toEqual(ICE_CAMERA);
    expect(ice.modes).toEqual(pkg.topic.scene.modes);
    init(pkg);
    showStageSample(pkg.topic, 'ice');
    showStageSample(pkg.topic, 'nope');
    expect(useViewer.getState().sample).toBeNull();
  });

  it('store: the sample camera and modes apply, the focus clears, «Сброс» keeps the sample modes, the default restores', () => {
    const pkg = fixture();
    init(pkg);
    const v = () => useViewer.getState();
    v().select(v().conceptKeys[0]!);
    v().toggleMode('labels');
    showStageSample(pkg.topic, 'ice');
    expect(v().sample).toBe('ice');
    expect(v().sampleCamera).toEqual(ICE_CAMERA);
    expect(v().selected).toBeNull();
    // Mode defaults come from the sample's scene (shells off), its patch on top; the teacher's labels carry over.
    expect(v().modes).toMatchObject({ rep: 'spacefill', shells: false, labels: true });
    v().toggleMode('ball-stick');
    v().resetView();
    expect(v().modes).toMatchObject({ rep: 'spacefill', shells: false, labels: false });
    // The default specimen = the topic scene: defaults again, no sample camera.
    showStageSample(pkg.topic, 'h2o');
    expect(v()).toMatchObject({ sample: null, sampleCamera: null, sampleModes: null });
    expect(v().modes).toMatchObject({ rep: 'ball-stick', shells: true });
    // A sample with only a camera keeps the current modes.
    v().toggleMode('spacefill');
    showStageSample(pkg.topic, 'ch4');
    expect(v().modes.rep).toBe('spacefill');
    expect(v().sampleCamera).toEqual(LINK_CAMERA);
  });

  it('ribbon: samples with a scene go on the stage, the default restores the topic scene, others keep their behaviour', async () => {
    const user = userEvent.setup();
    const pkg = fixture();
    renderTopic(<SampleStrip />, { pkg });
    init(pkg);
    const card = (name: RegExp) => screen.getAllByRole('listitem').find((li) => within(li).queryByText(name))!;
    const h2o = within(card(/^Water$|H₂O|h2o/i)).getByRole('button');
    expect(h2o).toHaveAttribute('aria-current', 'true');
    const ice = card(/^Ice$/);
    await user.click(within(ice).getByRole('button'));
    expect(useViewer.getState().sample).toBe('ice');
    expect(within(ice).getByRole('button')).toHaveAttribute('aria-current', 'true');
    expect(h2o).not.toHaveAttribute('aria-current');
    // `steam` has no scene: a plain card as before; `ch4` (another topic) with a scene: stage button + link.
    expect(within(card(/vapour/i)).queryByRole('button')).toBeNull();
    const ch4 = card(/^Methane$/);
    expect(within(ch4).getByRole('button')).toBeInTheDocument();
    expect(within(ch4).getByRole('link')).toHaveAttribute('href', expect.stringContaining('methane'));
    await user.click(h2o);
    expect(useViewer.getState().sample).toBeNull();
    expect(h2o).toHaveAttribute('aria-current', 'true');
  });

  it('stage: renders sceneForSample without remounting the viewer; the sample camera is the home view', async () => {
    const pkg = fixture();
    renderTopic(<Stage ready />, { pkg });
    init(pkg);
    await screen.findByTestId('scene');
    expect(last().topic.scene).toBe(pkg.topic.scene);
    act(() => showStageSample(pkg.topic, 'ice'));
    expect(last().topic.scene.params).toMatchObject({ formula: 'ICE', shells: false });
    expect(last().topic.scene.camera).toEqual(ICE_CAMERA);
    expect(last()).toMatchObject({ stageSample: 'ice', sampleCamera: ICE_CAMERA });
    // Camera-only sample: the params object is the topic's (plugins memoise on it; a GLB is not reloaded).
    act(() => showStageSample(pkg.topic, 'ch4'));
    expect(last().topic.scene.params).toBe(pkg.topic.scene.params);
    expect(last().topic.scene.asset).toBe(pkg.topic.scene.asset);
    act(() => showStageSample(pkg.topic, null));
    expect(last().topic.scene).toBe(pkg.topic.scene);
    expect(last()).toMatchObject({ stageSample: null, sampleCamera: null });
    expect(viewer.mounts).toBe(1);
  });

  it('lesson: a step with a sample shows it (the step camera/modes/focus on top); steps without one show the topic scene', async () => {
    const user = userEvent.setup();
    const pkg = fixture();
    const steps = pkg.topic.activities.tour!.steps;
    renderTopic(<LessonPanel ready />, { pkg, lesson: true });
    init(pkg);
    act(() => useViewer.getState().setLessonStep(0));
    expect(useViewer.getState().sample).toBeNull();
    await user.keyboard('{ArrowRight}');
    const s = useViewer.getState();
    expect(s.sample).toBe('ice');
    expect(s.modes).toMatchObject({ rep: 'spacefill', labels: true });
    expect(s.selected).toBe(steps[1]!.focus ?? null);
    expect(s.stepCamera).toEqual(steps[1]!.camera ?? null);
    await user.keyboard('{ArrowRight}');
    expect(useViewer.getState().sample).toBeNull();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(useViewer.getState().sample).toBeNull();
  });
});
