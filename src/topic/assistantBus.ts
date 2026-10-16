/**
 * The floating assistant: its dock state (collapsed button / panel / large
 * dialog, remembered per device) and «Спросить про это» from the concept card,
 * which opens the dock and queues the question.
 */
import { create } from 'zustand';

export type ChatMode = 'closed' | 'panel' | 'expanded';
const MODE_KEY = 'bilig.chat';

function initialMode(): ChatMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'panel' || v === 'expanded' || v === 'closed') return v;
  } catch {
    /* ignore */
  }
  return 'closed';
}

export const useAssistantBus = create<{ pending: string | null; nonce: number; mode: ChatMode }>(() => ({ pending: null, nonce: 0, mode: initialMode() }));

export function setChatMode(mode: ChatMode): void {
  useAssistantBus.setState({ mode });
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function askAssistant(question: string): void {
  if (useAssistantBus.getState().mode === 'closed') setChatMode('panel');
  useAssistantBus.setState((s) => ({ pending: question, nonce: s.nonce + 1 }));
}
