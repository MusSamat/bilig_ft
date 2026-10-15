/**
 * Thumbnail with a graceful fallback (W-12): build-time WebP renders may not
 * exist yet (placeholder hashes), so a missing image becomes a hue gradient
 * with the subject icon instead of a broken image.
 */
import { useState, type CSSProperties } from 'react';
import { Icon } from './Icon';

export function Thumb(props: { src?: string; alt: string; hue: number; icon: string; width?: number; height?: number; className?: string; style?: CSSProperties }): JSX.Element {
  const { src, alt, hue, icon, width, height, className, style } = props;
  const [failed, setFailed] = useState(!src);
  if (failed || !src) {
    return (
      <span
        className={`thumb-fallback${className ? ` ${className}` : ''}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ width, height, background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 45% 22%))`, ...style }}
      >
        <Icon name={icon} size={28} />
      </span>
    );
  }
  return <img src={src} alt={alt} width={width} height={height} loading="lazy" className={className} style={style} onError={() => setFailed(true)} />;
}
