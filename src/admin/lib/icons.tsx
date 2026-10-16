/**
 * Admin icons: the client's «Bilig Workbench» sprite (`src/components/icons`,
 * 24 grid, stroke 1.7, round caps/joins, currentColor) plus a few admin-only
 * glyphs drawn on the same grid. Content icon ids (Subject.icon, Process.icon,
 * PropertyTypeDef.icon) resolve exactly like the client does, so the picker
 * previews the glyph students will see.
 */
import type { CSSProperties } from 'react';
import { ICONS, ICON_IDS, iconId } from '../../components/icons';

/** Admin-only glyphs (same style as the prototype sprite). */
const ADMIN_ICONS: Record<string, string> = {
  'a-dashboard': "<rect x='3.5' y='3.5' width='7' height='9' rx='2'/><rect x='13.5' y='3.5' width='7' height='5' rx='2'/><rect x='13.5' y='11.5' width='7' height='9' rx='2'/><rect x='3.5' y='15.5' width='7' height='5' rx='2'/>",
  'a-topic': "<path d='M5 4.5h10.5L19 8v11.5H5z'/><path d='M12 10.2l3.3 1.9v3.8L12 17.8l-3.3-1.9v-3.8z'/><path d='M12 14l3.3-1.9M12 14v3.8M12 14l-3.3-1.9'/>",
  'a-route': "<circle cx='6' cy='18' r='2'/><circle cx='18' cy='6' r='2'/><path d='M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16'/>",
  'a-steps': "<rect x='3' y='4' width='6' height='6' rx='2'/><rect x='15' y='14' width='6' height='6' rx='2'/><path d='M9 7h4a3 3 0 0 1 3 3v4'/><path d='M14 12l2 2 2-2'/>",
  'a-quiz': "<rect x='4' y='3.5' width='16' height='17' rx='2.5'/><path d='M8 9l1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9.2H17M14.5 15.2H17'/>",
  'a-glossary': "<path d='M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z'/><path d='M4 21V5'/><path d='M9 13l2.5-6 2.5 6M9.8 11h3.4'/>",
  'a-publish': "<path d='M12 15V4M7.5 8.5L12 4l4.5 4.5'/><path d='M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'/>",
  'a-review': "<path d='M4 5h16v11H9l-5 4z'/><path d='M8.5 10.5l2 2 4-4'/>",
  'a-audit': "<path d='M6 3h8l5 5v13H6z'/><path d='M14 3v5h5'/><circle cx='11.5' cy='14' r='2.6'/><path d='M13.4 15.9L16 18.5'/>",
  'a-tutor': "<path d='M4 5h16v11H9l-5 4z'/><path d='M12 7.8l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z'/>",
  'a-folder': "<path d='M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'/>",
  'a-empty': "<path d='M3.5 13.5l3-8h11l3 8'/><path d='M3.5 13.5V19h17v-5.5h-5a3.5 3.5 0 0 1-7 0z'/>",
  'a-drag': "<circle cx='9' cy='6' r='1'/><circle cx='15' cy='6' r='1'/><circle cx='9' cy='12' r='1'/><circle cx='15' cy='12' r='1'/><circle cx='9' cy='18' r='1'/><circle cx='15' cy='18' r='1'/>",
  'a-cloud-ok': "<path d='M7 18a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 18.6 10 4 4 0 0 1 17.5 18z'/><path d='M9.5 13.5l2 2 3.5-3.5'/>",
  'a-palette': "<path d='M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.7-1.3-3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z'/><circle cx='7.5' cy='11' r='1'/><circle cx='10' cy='7' r='1'/><circle cx='14.5' cy='7' r='1'/>",
};

/** UI-only glyphs never offered as a content icon. */
const UI_ONLY = new Set(['x', 'prev', 'next', 'down', 'up', 'chev', 'plus', 'minus', 'trash', 'copy', 'print', 'keyboard', 'external', 'dot', 'circle', 'pointer', 'wheel', 'arrow', 'arrowdn', 'reset', 'send', 'eyeoff', 'search', 'logout', 'menu', 'filter', 'sort', 'download', 'upload', 'lock', 'user', 'users', 'mail', 'key', 'info', 'warn', 'check', 'pencil', 'globe2', 'solid', 'fill', 'cut', 'focus', 'wifioff', 'pause', 'play']);

/** Content icon ids for the picker (the client sprite, minus UI chrome). */
export const ICON_SET: readonly string[] = ICON_IDS.filter((id) => !UI_ONLY.has(id));

const resolve = (name: string): string => (name in ADMIN_ICONS ? name : iconId(name));

/** One sprite icon. `size`: 16 (sm), 20 (default), 24 (lg). Decorative (aria-hidden). */
export function Icon({ id, size = 20, className, style }: { id: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} className={className ? `ic ${className}` : 'ic'} style={style}>
      <use href={`#i-${resolve(id)}`} />
    </svg>
  );
}

/**
 * The sprite: the client's symbols (the admin is mounted outside the client
 * Shell, so it brings its own copy) plus the admin-only glyphs.
 */
export function AdminIconSprite() {
  const all = { ...ICONS, ...ADMIN_ICONS };
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {Object.entries(all).map(([id, markup]) => (
        <symbol key={id} id={`i-${id}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: markup }} />
      ))}
    </svg>
  );
}
