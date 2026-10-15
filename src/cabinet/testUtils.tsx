/** Test helpers for cabinet pages: providers + a `/:lang/*` router, and session reset. */
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GUEST, grantedPermissions } from '@bilig/permissions';
import '../i18n';
import { useSession } from '../api/session';
import { tokens } from '../api/tokens';

export function resetSession(): void {
  tokens.set(null);
  useSession.setState({ status: 'guest', me: null, permissions: grantedPermissions(GUEST) });
}

export function renderPage(path: string, routePath: string, element: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
