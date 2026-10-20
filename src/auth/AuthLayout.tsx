/**
 * The sign-in screens' frame: a brand panel (what Bilig gives) beside the form card.
 * One column below 980px, where the brand panel shrinks to the title and lead line.
 */
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { useTranslation } from 'react-i18next';
import { cx, glass } from './ui';

interface Props {
  titleId: string;
  title: string;
  lead: string;
  points: { icon: string; text: string }[];
  note?: ReactNode;
  /** Accessible name of the form card. */
  cardLabel?: string;
  cardLabelledBy?: string;
  children: ReactNode;
}

export function AuthLayout({ titleId, title, lead, points, note, cardLabel, cardLabelledBy, children }: Props): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="mx-auto grid w-full max-w-[1080px] items-start gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-stretch">
        <section className={cx(glass, 'grid content-center gap-3 p-5 md:p-8 lg:gap-4 lg:p-10')} aria-labelledby={titleId}>
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <b className="font-serif text-lg" aria-hidden="true">
              {t('app.title')}
            </b>
          </div>
          <h1 id={titleId} className="m-0 font-serif text-2xl font-bold leading-[1.1] tracking-[-0.01em] text-ink lg:text-[clamp(30px,3.6vw,46px)]">
            {title}
          </h1>
          <p className="m-0 text-md text-muted lg:text-lg">{lead}</p>
          <ul className="m-0 hidden list-none gap-2.5 p-0 lg:grid">
            {points.map((p) => (
              <li key={p.icon} className="flex items-center gap-3 font-medium text-ink">
                <span className="text-accent">
                  <Icon name={p.icon} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          {note && <div className="hidden lg:block">{note}</div>}
        </section>
        <section className={cx(glass, 'grid content-start gap-4 p-4 sm:p-6')} aria-label={cardLabel} aria-labelledby={cardLabelledBy}>
          {children}
        </section>
      </div>
    </div>
  );
}

/** A muted line with a small icon (privacy, trial notes). */
export function AuthNote({ icon, children }: { icon: string; children: ReactNode }): JSX.Element {
  return (
    <p className="m-0 flex gap-2 text-sm text-muted">
      <span className="mt-0.5 shrink-0 text-accent">
        <Icon name={icon} className="sm" />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Error summary at the top of a step: announced, focusable, links to the fields at fault. */
export const ErrorSummary = ({ id, title, items, summaryRef }: { id: string; title: string; items: { text: string; fieldId?: string }[]; summaryRef: React.Ref<HTMLDivElement> }): JSX.Element => (
  <div
    id={id}
    ref={summaryRef}
    tabIndex={-1}
    role="alert"
    className={cx(
      'rounded-md border-2 border-bad bg-[color-mix(in_srgb,var(--bad)_8%,transparent)] px-4 py-3 text-ink focus:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--bad)_35%,transparent)]',
      !items.length && 'hidden',
    )}
  >
    {items.length > 0 && (
      <>
        <p className="m-0 flex items-center gap-2 font-bold text-bad">
          <Icon name="warn" className="sm" />
          {title}
        </p>
        <ul className="m-0 mt-1 grid list-none gap-1 p-0 text-sm">
          {items.map((it) => (
            <li key={it.text}>
              {it.fieldId ? (
                <a
                  href={`#${it.fieldId}`}
                  className="font-semibold text-bad underline underline-offset-2"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(it.fieldId!)?.focus();
                  }}
                >
                  {it.text}
                </a>
              ) : (
                it.text
              )}
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);
