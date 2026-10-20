import { useEffect, useState } from 'react';

/** Seconds left until `deadline` (epoch ms), ticking once a second; 0 when passed or null. */
export function useSecondsLeft(deadline: number | null): number {
  const calc = () => (deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!deadline || deadline <= Date.now()) return;
    const id = window.setInterval(() => {
      const v = calc();
      setLeft(v);
      if (v <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
  return left;
}

/** «0:45», «2:05» — a countdown as a clock. */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Deadline (epoch ms) `seconds` from now. */
export const deadlineIn = (seconds: number): number => Date.now() + Math.max(0, seconds) * 1000;
