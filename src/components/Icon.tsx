/**
 * SVG icon sprite (TZ §7 «свои SVG-иконки спрайтом»). One hidden <svg> with
 * <symbol>s is mounted once; icons reference it with <use>. Subject, property
 * and process icons are looked up by the id stored in content data.
 */
import type { CSSProperties } from 'react';

/** 24×24 stroke paths (currentColor). */
const PATHS: Record<string, string> = {
  // UI
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  close: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  reset: 'M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 10',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'eye-off': 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  presentation: 'M3 4h18M5 4v11h14V4M12 15v4M8 21l4-2 4 2',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  chat: 'M4 5h16v11H9l-5 4z',
  send: 'M4 12l16-8-6 16-2-7z',
  'wifi-off': 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5A15 15 0 0 1 7 6.6M12 20h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  sync: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  graduation: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  dot: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  // Subjects (generic shapes, chosen by data)
  leaf: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9',
  shapes: 'M7 3l4 7H3zM14 14h7v7h-7zM7 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  atom: 'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM12 3c-2.5 0-4 4-4 9s1.5 9 4 9 4-4 4-9-1.5-9-4-9zM4.2 7.5c-1.2 2.2 1.4 5.6 5.8 8.1s8.6 2.8 9.8.6-1.4-5.6-5.8-8.1-8.6-2.8-9.8-.6z',
  planet: 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM3 15c-2 2 3 3 9 1s10-6 9-8',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 5v16',
  // Property types (content-model PROPERTY_TYPES icons)
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  'map-pin': 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5',
  lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  'function-square': 'M4 4h16v16H4zM9 17s1 0 1.5-2.5L12 9c.5-2 1.5-2 2.5-2M9 12h5',
  scale: 'M12 4v16M5 20h14M6 8h12M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0z',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  weight: 'M7 8h10l3 13H4zM12 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  thermometer: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
  'thermometer-snowflake': 'M10 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0zM17 4v10M13 7l8 4M21 7l-8 4',
  'thermometer-sun': 'M10 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0zM18 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 2v1.5M22 9h-1.5',
  'plus-minus': 'M12 3v8M8 7h8M7 18h10',
  triangle: 'M12 4l9 16H3z',
  // Processes
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  flame: 'M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8a7 7 0 0 0 7 7z',
  droplet: 'M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  // Ids used by real content (catalog icons, property types, processes)
  'magnet': 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4',
  'sigma': 'M18 4H6l6 8-6 8h12',
  'cpu': 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  'telescope': 'M3 14l14-7 2 4-14 7zM10 15l-3 6M12 14l3 7M17 7l2-1 2 4-2 1',
  'flask-conical': 'M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10',
  'circle-dot': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  'circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  'square': 'M5 5h14v14H5z',
  'square-stack': 'M8 8h12v12H8zM4 16V4h12',
  'spline': 'M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 15C5 9 13 7 17 7',
  'battery': 'M3 7h15v10H3zM21 10v4M6 10v4',
  'battery-charging': 'M3 7h15v10H3zM21 10v4M11 8l-3 4h4l-3 4',
  'link': 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  'link-2': 'M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8',
  'arrow-down-to-line': 'M12 3v12M7 10l5 5 5-5M5 21h14',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  'arrow-big-right': 'M3 9h9V4l9 8-9 8v-5H3z',
  'gauge': 'M12 14l4-4M4 18a9 9 0 1 1 16 0',
  'gauge-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 13l3-4',
  'waves': 'M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  'zigzag': 'M3 12l3-6 3 12 3-12 3 12 3-12 3 6',
  'mountain': 'M2 20l7-12 4 6 3-4 6 10z',
  'trending-up': 'M3 17l6-6 4 4 8-8M15 7h6v6',
  'triangle-right': 'M4 20h16V4z',
  'grip': 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  'move-down-right': 'M5 5l14 14M19 9v10H9',
  'move-horizontal': 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  'pyramid': 'M12 3L3 19h18zM12 3l3 16',
  'clock': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  'timer': 'M10 2h4M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 10v4',
  'orbit': 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 4a8 8 0 1 0 8 8M19 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  'network': 'M12 3v6M5 21v-4h14v4M12 13v4M9 9h6v4H9z',
  'heart-pulse': 'M20.8 5.6a5 5 0 0 0-8.8-1 5 5 0 0 0-8.8 1c-1 4 3 8 8.8 13 5.8-5 9.8-9 8.8-13zM3 12h5l2-3 3 6 2-3h6',
  'snowflake': 'M12 2v20M4 6l16 12M20 6L4 18',
  'recycle': 'M7 19H4l3-5M17 19h3l-3-5M12 4l-2 4h4zM8 14l-2-3M16 14l2-3M9 19h6',
  'cloud-rain': 'M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 17.6 9 3.5 3.5 0 0 1 17 15zM8 18v2M12 18v2M16 18v2',
};

export const ICON_IDS = Object.keys(PATHS);
export const hasIcon = (name: string): boolean => name in PATHS;

/** Mount once at the app root. */
export function IconSprite(): JSX.Element {
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {Object.entries(PATHS).map(([id, d]) => (
        <symbol key={id} id={`i-${id}`} viewBox="0 0 24 24">
          <path d={d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
      ))}
    </svg>
  );
}

export function Icon({ name, size = 20, className, style }: { name: string; size?: number; className?: string; style?: CSSProperties }): JSX.Element {
  const id = hasIcon(name) ? name : 'dot';
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} className={className ? `icon ${className}` : 'icon'} style={style}>
      <use href={`#i-${id}`} />
    </svg>
  );
}
