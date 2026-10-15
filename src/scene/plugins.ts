/** Register every scene plugin package into the shared registry (TZ §7 «новый тип сцены — новый пакет plugin-*»). */
import { registry } from '@bilig/scene-core';
import { createGltfPlugin } from '@bilig/plugin-gltf';
import { moleculePlugin } from '@bilig/plugin-molecule';
import { crystalPlugin } from '@bilig/plugin-crystal';
import { geometryPlugin } from '@bilig/plugin-geometry';
import { simPlugin } from '@bilig/plugin-sim';
import { KTX2_TRANSCODER_PATH } from '../config';

export function registerPlugins(): void {
  registry.register(createGltfPlugin({ ktx2TranscoderPath: KTX2_TRANSCODER_PATH }));
  registry.register(moleculePlugin);
  registry.register(crystalPlugin);
  registry.register(geometryPlugin);
  registry.register(simPlugin);
}
