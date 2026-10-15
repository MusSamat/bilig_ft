/** Register all scene plugins into the shared registry at app startup. */
import { registry } from '@bilig/scene-core';
import { cellPlugin } from './scene/CellPlugin';

export function registerPlugins(): void {
  registry.register(cellPlugin);
  // Future: moleculePlugin (chem), crystalPlugin, geometryPlugin, simPlugin.
}
