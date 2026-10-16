/**
 * Thumbnail with a graceful fallback (W-12): build-time WebP renders may not
 * exist yet (placeholder hashes), so a missing image becomes the subject's
 * swatch (hue tokens) with the subject icon instead of a broken image.
 */
import { useState, type CSSProperties } from 'react';
import { subjectSwatch } from '@bilig/scene-core';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

export function Thumb(props: { src?: string; alt: string; hue: number; icon: string; width?: number; height?: number; className?: string; style?: CSSProperties }): JSX.Element {
  const { src, alt, hue, icon, width, height, className, style } = props;
  const theme = useUi((s) => s.theme);
  const [failed, setFailed] = useState(!src);
  if (failed || !src) {
    const sw = subjectSwatch(hue, theme);
    return (
      <span
        className={`thumb-fallback${className ? ` ${className}` : ''}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ background: sw.bg, color: sw.fg, ...style }}
      >
        <Icon name={icon} className="lg" />
      </span>
    );
  }
  return <img src={src} alt={alt} width={width} height={height} loading="lazy" className={className} style={style} onError={() => setFailed(true)} />;
}
