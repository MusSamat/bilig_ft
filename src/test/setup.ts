/** Vitest setup: jest-dom matchers, IndexedDB shim, MSW node server for component tests. */
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll } from 'vitest';

if (typeof window !== 'undefined') {
  const { server } = await import('../mocks/node');
  const { resetMockDb } = await import('../mocks/db');
  const { cleanup } = await import('@testing-library/react');
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    resetMockDb();
  });
  afterAll(() => server.close());

  // jsdom gaps used by the UI.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo ??= () => {};
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
