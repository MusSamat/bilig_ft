import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import i18n from '../i18n';
import { renderRoutes, resetSession } from '../test/utils';
import { Shell } from './Shell';

describe('Header language switch (W-05 bug fix)', () => {
  beforeEach(resetSession);

  it('navigates to the same topic URL under the new language and keeps the query', async () => {
    const user = userEvent.setup();
    renderRoutes(
      '/ky/bio/g7/animal-cell?focus=bio.nucleus&mode=section',
      <Route path="/:lang" element={<Shell />}>
        <Route path="*" element={<p>page</p>} />
      </Route>,
    );
    await user.click(screen.getByRole('link', { name: 'Русский' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/ru/bio/g7/animal-cell?focus=bio.nucleus&mode=section');
    expect(i18n.language).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(screen.getByRole('link', { name: 'Русский' })).toHaveAttribute('aria-current', 'true');
  });

  it('home page respects :lang', async () => {
    renderRoutes('/en', <Route path="/:lang" element={<Shell />}><Route index element={<p>home</p>} /></Route>);
    expect(i18n.language).toBe('en');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
