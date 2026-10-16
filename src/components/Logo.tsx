/**
 * Bilig brand mark (prototype `i-logo`): a rounded square with a fixed
 * teal → indigo → amber gradient (the brand does not follow the subject hue),
 * a white mountain line and a sun. Each instance gets its own gradient id so
 * several marks on one page never clash. Decorative copies are aria-hidden.
 */
import { useId } from 'react';

export const LOGO_STOPS = [
  ['0', '#0B7A6E'],
  ['.55', '#4450C9'],
  ['1', '#F2A93B'],
] as const;

export function LogoMark({ size = 34, label }: { size?: number; label?: string }): JSX.Element {
  const id = `bilig-lg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {LOGO_STOPS.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill={`url(#${id})`} />
      <path d="M5 22l6-8 4 5 4-7 8 10" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="9" r="2.6" fill="#fff" />
    </svg>
  );
}

/** Standalone SVG source of the mark (favicons, PPTX/PDF title slides). */
export const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  LOGO_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
  '</linearGradient></defs><rect width="32" height="32" rx="10" fill="url(#g)"/><path d="M5 22l6-8 4 5 4-7 8 10" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="9" r="2.6" fill="#fff"/></svg>';
