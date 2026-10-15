/** Bootstrap: i18n, (dev) mock API, TanStack Query, session restore. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './styles.css';
import { MOCK_API } from './config';
import { App } from './App';
import { bootstrapSession } from './api/session';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

async function start(): Promise<void> {
  // MSW only in dev with VITE_MOCK=1; the import is dead code in production builds.
  if (import.meta.env.DEV && MOCK_API) {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
  void bootstrapSession();
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void start();
