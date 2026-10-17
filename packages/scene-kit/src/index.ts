/**
 * @bilig/scene-kit — react-three-fiber helpers shared by every scene plugin
 * (TZ W-21 picking, W-22 highlight, W-24 ghost/hide, W-25 translucent shells),
 * plus declarative named parts bound to concepts by node name.
 */
export * from './look.js';
export * from './pick.js';
export * from './hooks.js';
export * from './parts.js';
export { PartsView, type PartsViewProps } from './PartsView.js';
export { CompileGate, useShadersCompiling } from './CompileGate.js';
export { SceneFx, type SceneFxProps } from './SceneFx.js';
export { hullGeometry, isOutline, outlineMaterial, outlineResolution, setOutline, OUTLINE_LAYERS, type OutlineStyle } from './outline.js';
export { setSaturation, setTint } from './saturation.js';
