/**
 * Text parts (`shape.kind === 'text'`): the text is drawn once into a canvas
 * texture and shown on a plane — crisp numbers next to arrows, axis titles
 * and readouts that scale with the scene, unlike DOM labels, which belong to
 * concepts (W-22). White glyphs multiplied by the part colour; an optional
 * dark plate keeps them readable on a projector. Billboards face the camera.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, PlaneGeometry, Quaternion, SRGBColorSpace, type Mesh, type Object3D } from 'three';
import type { ConceptLook } from './look.js';
import type { PartShape } from './parts.js';

type TextShape = Extract<PartShape, { kind: 'text' }>;

/** Canvas pixels per line of text (texture resolution). */
const LINE_PX = 64;
const FONT = '"Noto Sans Variable", "Noto Sans", system-ui, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const PAD_X = 0.32;
const PAD_Y = 0.16;
const LINE_GAP = 1.18;

export interface TextLayout {
  lines: string[];
  /** Plane size in scene units. */
  width: number;
  height: number;
  /** Anchor offset of the plane centre along local X. */
  offsetX: number;
}

/** Pure layout from measured line widths (in units of the line height). */
export function textLayout(shape: TextShape, measure: (line: string) => number): TextLayout {
  const lines = shape.text.split('\n');
  const em = Math.max(...lines.map(measure), 0.3);
  const width = (em + 2 * PAD_X) * shape.size;
  const height = (lines.length * LINE_GAP + 2 * PAD_Y) * shape.size;
  const align = shape.align ?? 'center';
  const offsetX = align === 'left' ? width / 2 - PAD_X * shape.size * 0.5 : align === 'right' ? -width / 2 + PAD_X * shape.size * 0.5 : 0;
  return { lines, width, height, offsetX };
}

function drawText(shape: TextShape): { tex: CanvasTexture; layout: TextLayout } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `${shape.bold ? 700 : 560} ${LINE_PX * 0.8}px ${FONT}`;
  ctx.font = font;
  const layout = textLayout(shape, (l) => ctx.measureText(l).width / LINE_PX);
  const k = LINE_PX / shape.size;
  canvas.width = Math.min(2048, Math.ceil(layout.width * k));
  canvas.height = Math.min(1024, Math.ceil(layout.height * k));
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  const paint = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (shape.plate) {
      const r = Math.min(canvas.height / 2, LINE_PX * 0.45);
      ctx.fillStyle = 'rgba(9, 14, 22, 0.72)';
      ctx.beginPath();
      ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, r);
      ctx.fill();
    }
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    const align = shape.align ?? 'center';
    ctx.textAlign = align;
    const x = align === 'left' ? PAD_X * LINE_PX : align === 'right' ? canvas.width - PAD_X * LINE_PX : canvas.width / 2;
    layout.lines.forEach((line, i) => {
      if (!shape.plate) {
        // A soft dark outline instead of a plate.
        ctx.lineWidth = LINE_PX * 0.12;
        ctx.strokeStyle = 'rgba(8, 12, 20, 0.55)';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, x, (PAD_Y + (i + 0.5) * LINE_GAP) * LINE_PX);
      }
      ctx.fillText(line, x, (PAD_Y + (i + 0.5) * LINE_GAP) * LINE_PX);
    });
    tex.needsUpdate = true;
  };
  paint();
  // Webfonts may still be loading: repaint once they are ready.
  document.fonts?.ready.then(paint).catch(() => {});
  return { tex, layout };
}

const camQ = new Quaternion();
const parentQ = new Quaternion();

export function TextPart({ name, shape, color, look, position, rotation, scale, register }: {
  name: string;
  shape: TextShape;
  color: string;
  look: ConceptLook;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  register: (o: Object3D | null) => void;
}): JSX.Element | null {
  const drawn = useMemo(() => drawText(shape), [shape.text, shape.size, shape.align, shape.plate, shape.bold]); // eslint-disable-line react-hooks/exhaustive-deps
  const geom = useMemo(() => (drawn ? new PlaneGeometry(drawn.layout.width, drawn.layout.height).translate(drawn.layout.offsetX, 0, 0) : null), [drawn]);
  useEffect(() => () => {
    drawn?.tex.dispose();
    geom?.dispose();
  }, [drawn, geom]);
  const ref = useRef<Mesh | null>(null);
  const billboard = shape.billboard !== false;
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m || !billboard) return;
    // World orientation = camera's: local = parent⁻¹ · camera.
    m.parent?.getWorldQuaternion(parentQ);
    camera.getWorldQuaternion(camQ);
    m.quaternion.copy(parentQ.invert().multiply(camQ));
  });
  if (!drawn || !geom) return null;
  const { tex } = drawn;
  const opacity = look.dimmed ? 0.35 : Math.min(1, look.opacity + (look.transparent ? 0.2 : 0));
  return (
    <group name={name} position={position} rotation={billboard ? undefined : rotation} scale={scale} ref={register}>
      <mesh ref={ref} geometry={geom} raycast={() => {}} renderOrder={12}>
        <meshBasicMaterial
          map={tex}
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
