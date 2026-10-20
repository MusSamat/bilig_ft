/**
 * A visible countdown («You can try again in 0:42») that does not chatter: screen
 * readers hear it once when it starts and once when the wait is over.
 */
import { useEffect, useRef, useState } from 'react';
import { clock } from './useCountdown';

interface Props {
  secondsLeft: number;
  /** Visible text while waiting; `{time}` is passed as m:ss. */
  waiting: (time: string) => string;
  /** Said (and shown, when `showReady`) once the wait is over. */
  ready: string;
  /** Said once when the countdown starts. */
  started?: string;
  showReady?: boolean;
  testId?: string;
}

export function RetryLine({ secondsLeft, waiting, ready, started, showReady, testId }: Props): JSX.Element {
  const [announce, setAnnounce] = useState('');
  const counting = secondsLeft > 0;
  const mounted = useRef(false);
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    setAnnounce(counting ? started ?? '' : first ? '' : ready);
    // announce only on the counting ↔ done edge
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting]);
  return (
    <>
      {counting ? (
        <p className="m-0 text-sm tabular-nums text-muted" aria-hidden="true" data-testid={testId}>
          {waiting(clock(secondsLeft))}
        </p>
      ) : (
        showReady && <p className="m-0 text-sm font-semibold text-ok" aria-hidden="true">{ready}</p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
