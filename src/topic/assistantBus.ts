/** «Спросить помощника» from the card: queue a question for the assistant panel and focus it. */
import { create } from 'zustand';

export const useAssistantBus = create<{ pending: string | null; nonce: number }>(() => ({ pending: null, nonce: 0 }));

export function askAssistant(question: string): void {
  useAssistantBus.setState((s) => ({ pending: question, nonce: s.nonce + 1 }));
  document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
