/**
 * The shared 3D viewer (TZ W-20: "Ядро вьюера, одинаково для всех плагинов").
 * It owns the canvas, camera and controls; the plugin only draws inside it.
 * Degrades to a static message when WebGL is unavailable (TZ W-26).
 */
import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import type { ResolvedConcept, Topic } from '@bilig/content-model';
import { registry, type ViewerState } from '@bilig/scene-core';
import { useStore } from '../store';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (
      !!window.WebGLRenderingContext &&
      !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export function SceneViewer({
  topic,
  concepts,
}: {
  topic: Topic;
  concepts: ResolvedConcept[];
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const modes = useStore((s) => s.modes);
  const selectedConceptKey = useStore((s) => s.selectedConceptKey);
  const selectConcept = useStore((s) => s.selectConcept);

  const plugin = registry.get(topic.scene.plugin);
  const hasWebgl = useMemo(webglAvailable, []);

  if (!hasWebgl || !plugin) {
    return (
      <div className="viewer viewer--fallback">
        <p>{t('viewer.webglError')}</p>
      </div>
    );
  }

  const Plugin = plugin.Component;
  const state: ViewerState = { lang, selectedConceptKey, modes };
  const cam = topic.scene.camera;

  return (
    <div className="viewer">
      <Canvas
        camera={{ position: cam?.position ?? [0, 1.5, 6], fov: cam?.fov ?? 45 }}
        onPointerMissed={() => selectConcept(null)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 6, 4]} intensity={1.1} />
        <directionalLight position={[-4, -2, -4]} intensity={0.3} />
        <Suspense fallback={null}>
          <Plugin topic={topic} concepts={concepts} state={state} onSelectConcept={selectConcept} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          autoRotate={!!modes.rotate}
          autoRotateSpeed={0.8}
          minDistance={3}
          maxDistance={12}
        />
      </Canvas>
    </div>
  );
}
