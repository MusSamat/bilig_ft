/**
 * Tailwind class sets of the sign-in screens (login, registration, password reset).
 * Literal strings so Tailwind's scanner sees every class; the theme is the strict
 * token theme of src/styles/tailwind.css (no default palette).
 */

/** Join class names, skipping falsy ones. */
export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

const ring =
  'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_40%,transparent)]';

/** Frosted panel, same look as the old `.panel.glass`. */
export const glass =
  'rounded-xl border border-edge bg-panel shadow-panel [-webkit-backdrop-filter:var(--blur)] [backdrop-filter:var(--blur)]';

export const fieldCls = 'grid min-w-0 gap-1.5';
export const labelCls = 'text-sm font-semibold text-ink';
export const helpCls = 'm-0 text-sm text-muted';
/** Inline field error (empty → takes no room). */
export const fieldErrorCls = 'm-0 text-sm font-semibold text-bad empty:hidden';

export const inputCls = cx(
  'block min-h-12 w-full min-w-0 rounded-pill border border-line bg-chip px-4 text-md text-ink',
  'transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]',
  'focus-visible:border-accent aria-[invalid=true]:border-bad disabled:opacity-60',
  ring,
);

export const primaryBtn = cx(
  'inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-pill border-0 bg-accent px-5 text-md font-bold text-on no-underline shadow-panel',
  'transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
  ring,
);

export const secondaryBtn = cx(
  'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-pill border border-line bg-chip px-4 font-semibold text-ink no-underline',
  'transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50',
  ring,
);

/** Low-emphasis text action (≥44px tall tap target). */
export const linkBtn = cx(
  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-pill border-0 bg-transparent px-2 text-sm font-semibold text-accent underline-offset-4',
  'hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline',
  ring,
);

/** The quietest action (e.g. «Sign in with e-mail»): muted until hovered. */
export const quietLinkBtn = cx(
  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-pill border-0 bg-transparent px-2 text-sm font-medium text-muted underline-offset-4',
  'hover:text-accent hover:underline',
  ring,
);

/** Round icon button inside a field (password show/hide). */
export const iconBtn = cx(
  'inline-grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted hover:text-ink',
  ring,
);

export const h2Cls = 'm-0 font-serif text-xl font-bold leading-[1.2] text-ink focus:outline-none';
