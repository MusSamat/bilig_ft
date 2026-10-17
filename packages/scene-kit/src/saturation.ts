/**
 * Focus colouring as material uniforms, for models whose colours live in
 * textures or vertex colours (GLBs) where `material.color` alone cannot do it:
 *  - saturation: structures that step back fade towards grey;
 *  - tint: the structure in focus takes its concept colour — the colour of its
 *    chip, label dot and card — while keeping the model's own shading and
 *    surface detail (the tint follows the surface's relative brightness).
 *
 * Installed before the first render (`setSaturation(m, 1)`) so focusing never
 * recompiles a shader.
 */
import { Color, type Material } from 'three';

interface FocusUniforms {
  sat: { value: number };
  tint: { value: Color };
  tintAmount: { value: number };
}
interface FocusData {
  __focus?: FocusUniforms;
}

const LUMA = 'vec3(0.2126, 0.7152, 0.0722)';

function install(m: Material): FocusUniforms {
  const ud = m.userData as FocusData;
  if (ud.__focus) return ud.__focus;
  const u: FocusUniforms = { sat: { value: 1 }, tint: { value: new Color(1, 1, 1) }, tintAmount: { value: 0 } };
  ud.__focus = u;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uSaturation = u.sat;
    shader.uniforms.uTint = u.tint;
    shader.uniforms.uTintAmount = u.tintAmount;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSaturation;\nuniform vec3 uTint;\nuniform float uTintAmount;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          `\tfloat focusLuma = dot(diffuseColor.rgb, ${LUMA});`,
          '\tdiffuseColor.rgb = mix(vec3(focusLuma), diffuseColor.rgb, uSaturation);',
          // Concept colour scaled by the surface's brightness relative to its average: folds and texture stay readable.
          `\tvec3 focusTinted = uTint * clamp(0.6 + 1.6 * (focusLuma - 0.18), 0.55, 1.3);`,
          '\tdiffuseColor.rgb = mix(diffuseColor.rgb, focusTinted, uTintAmount);',
        ].join('\n'),
      );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|focus`;
  m.needsUpdate = true;
  return u;
}

/** Saturation, 1 = as authored, 0 = grey. */
export function setSaturation(m: Material, s: number): void {
  install(m).sat.value = s;
}

/** Blend towards a CSS colour (`amount` 0 = off), keeping the surface's shading. */
export function setTint(m: Material, css: string | null, amount = 0): void {
  const u = install(m);
  u.tintAmount.value = css ? amount : 0;
  if (css) u.tint.value.set(css);
}
