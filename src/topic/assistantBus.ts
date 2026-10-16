/**
 * The floating assistant: its dock state (collapsed button / panel / large
 * dialog, remembered per device), questions queued from elsewhere on the page
 * («Спросить про это» on the concept card, quick actions on a text
 * selection), and a selected quote attached to the next question.
 */
import { create } from 'zustand';
import type { TutorContext, TutorIntent } from '@bilig/content-model/api';

export type ChatMode = 'closed' | 'panel' | 'expanded';
const MODE_KEY = 'bilig.chat';

/** A selection on the page, sent as `context.quote` (never as instructions). */
export type Quote = NonNullable<TutorContext['quote']>;

export interface AskRequest {
  /** What the chat shows as the teacher's message. */
  question: string;
  intent?: TutorIntent;
  quote?: Quote;
}

function initialMode(): ChatMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'panel' || v === 'expanded' || v === 'closed') return v;
  } catch {
    /* ignore */
  }
  return 'closed';
}

interface BusState {
  pending: AskRequest | null;
  nonce: number;
  mode: ChatMode;
  /** Quote attached to the next typed question («Спросить…» on a selection). */
  quote: Quote | null;
}

export const useAssistantBus = create<BusState>(() => ({ pending: null, nonce: 0, mode: initialMode(), quote: null }));

export function setChatMode(mode: ChatMode): void {
  useAssistantBus.setState({ mode });
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

const openDock = () => {
  if (useAssistantBus.getState().mode === 'closed') setChatMode('panel');
};

/** Open the assistant and ask now. */
export function askAssistant(req: string | AskRequest): void {
  openDock();
  const r = typeof req === 'string' ? { question: req } : req;
  useAssistantBus.setState((s) => ({ pending: r, nonce: s.nonce + 1 }));
}

/** Open the assistant with a quote attached to the question the teacher is about to type. */
export function attachQuote(quote: Quote): void {
  openDock();
  useAssistantBus.setState({ quote });
  // The input is mounted while the dock is open; focus once the dock has painted.
  requestAnimationFrame(() => document.getElementById('assistant-input')?.focus());
}

export const clearQuote = (): void => useAssistantBus.setState({ quote: null });
