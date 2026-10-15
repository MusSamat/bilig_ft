/** DEV-ONLY: MSW in the browser (`VITE_MOCK=1 npm run dev`) + controls for e2e tests. */
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { mockDb, resetMockDb, saveMockDb } from './db';

export const worker = setupWorker(...handlers);

declare global {
  interface Window {
    __biligMock?: {
      setOffline(v: boolean): void;
      setTutorDown(v: boolean): void;
      reset(): void;
      state(): typeof mockDb;
    };
  }
}

export async function startMocks(): Promise<void> {
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true, serviceWorker: { url: '/mockServiceWorker.js' } });
  window.__biligMock = {
    setOffline(v) {
      mockDb.flags.offline = v;
      saveMockDb();
      window.dispatchEvent(new Event(v ? 'offline' : 'online'));
    },
    setTutorDown(v) {
      mockDb.flags.tutorDown = v;
      saveMockDb();
    },
    reset: resetMockDb,
    state: () => mockDb,
  };
}
