/**
 * SVG icon sprite (TZ §7 «свои SVG-иконки спрайтом»). One hidden <svg> with
 * <symbol>s is mounted once; icons reference it with <use>. Glyphs and the
 * id aliases live in `./icons` (the Workbench prototype set).
 */
import type { CSSProperties } from 'react';
import { ICONS, iconId } from './icons';

export { ICON_IDS, hasIcon } from './icons';

/** Mount once at the app root. */
export function IconSprite(): JSX.Element {
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {Object.entries(ICONS).map(([id, markup]) => (
        <symbol key={id} id={`i-${id}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: markup }} />
      ))}
    </svg>
  );
}

/** `size`: 16 (sm), 20 (default), 24 (lg) or any px value (17–18 in props and tiles). */
export function Icon({ name, size, className, style }: { name: string; size?: number; className?: string; style?: CSSProperties }): JSX.Element {
  const px = size ?? (className?.includes('sm') ? 16 : className?.includes('lg') ? 24 : 20);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={px}
      height={px}
      className={className ? `ic ${className}` : 'ic'}
      style={size ? { width: size, height: size, ...style } : style}
    >
      <use href={`#i-${iconId(name)}`} />
    </svg>
  );
}
