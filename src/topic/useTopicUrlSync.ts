/**
 * Full URL state (TZ W-05): language and topic in the path; focus, modes,
 * process, step, view and lesson step in the query. The viewer store is the
 * working state; this hook mirrors it into the URL (replace) and applies
 * back/forward navigation to the store, so a link can be sent to a class.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Process } from '@bilig/content-model';
import { encodeModes, player } from '@bilig/scene-core';
import { useViewer } from '../state/viewer';

/** Query params owned by the viewer (others, e.g. `view` and `assignment`, are preserved). */
const OWNED = ['focus', 'mode', 'process', 'step', 'lesson'] as const;

export function viewerQuery(processes: readonly Process[]): Record<(typeof OWNED)[number], string | undefined> {
  const s = useViewer.getState();
  const proc = s.process && processes.some((p) => p.key === s.process!.key) ? s.process : null;
  const modes = encodeModes(s.modes, s.modeDefs);
  return {
    focus: s.selected ?? undefined,
    mode: modes.length ? modes.join(',') : undefined,
    process: proc?.key,
    step: proc ? String(Math.max(0, player.currentStep(proc.state))) : undefined,
    lesson: undefined,
  };
}

export function useTopicUrlSync(opts: { ready: boolean; processes: readonly Process[]; lesson: boolean }): void {
  const { ready, processes, lesson } = opts;
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const lastWritten = useRef<string | null>(null);

  // Store → URL.
  useEffect(() => {
    if (!ready) return;
    const write = () => {
      const q = viewerQuery(processes);
      const next = new URLSearchParams(window.location.search);
      for (const k of OWNED) next.delete(k);
      for (const k of OWNED) {
        const v = k === 'lesson' ? (lesson ? String(useViewer.getState().lessonStep) : undefined) : q[k];
        if (v !== undefined) next.set(k, v);
      }
      const search = next.toString().replace(/%2C/g, ',');
      const current = window.location.search.replace(/^\?/, '');
      if (search !== current) {
        lastWritten.current = search;
        navigate({ pathname: window.location.pathname, search: search ? `?${search}` : '' }, { replace: true });
      }
    };
    write();
    return useViewer.subscribe((s, prev) => {
      const stepChanged =
        s.process?.key !== prev.process?.key ||
        (s.process && prev.process && player.currentStep(s.process.state) !== player.currentStep(prev.process.state));
      if (s.selected !== prev.selected || s.modes !== prev.modes || stepChanged || s.lessonStep !== prev.lessonStep) write();
    });
  }, [ready, processes, lesson, navigate]);

  // URL → store (back/forward, pasted links within the same topic).
  useEffect(() => {
    if (!ready) return;
    const search = location.search.replace(/^\?/, '');
    if (search === lastWritten.current) return;
    const s = useViewer.getState();
    const focus = params.get('focus');
    if ((focus ?? null) !== s.selected) s.select(focus);
    const lessonParam = params.get('lesson');
    if (lessonParam && /^\d+$/.test(lessonParam) && Number(lessonParam) !== s.lessonStep) s.setLessonStep(Number(lessonParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, ready]);
}
