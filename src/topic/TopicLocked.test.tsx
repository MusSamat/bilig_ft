import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { problem } from '@bilig/content-model/api';
import i18n from '../i18n';
import { useSession } from '../api/session';
import { server } from '../mocks/node';
import { renderRoutes, resetSession } from '../test/utils';
import TopicPage from './TopicPage';

const locked = (status: 401 | 403) =>
  server.use(
    http.get('*/topics/:key/manifest', () =>
      HttpResponse.json(problem(status === 401 ? 'unauthorized' : 'forbidden', { detail: 'license_required', i18nKey: 'errors.license_required' }), { status }),
    ),
  );

const renderTopicPage = (path: string) => renderRoutes(path, <Route path="/:lang/:subject/:grade/:topic" element={<TopicPage />} />);

describe('licensed topic (401 / 403 license_required)', () => {
  beforeEach(async () => {
    resetSession();
    await i18n.changeLanguage('en');
  });

  it('a guest gets a sign-in prompt that returns to the topic, and a link to the subject’s demo topic', async () => {
    locked(401);
    renderTopicPage('/en/bio/g8/human-heart');
    expect(await screen.findByText(/This topic is for pupils and teachers of licensed schools/)).toBeInTheDocument();
    const signIn = screen.getByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveAttribute('href', `/en/login?next=${encodeURIComponent('/en/bio/g8/human-heart')}`);
    expect(screen.getByRole('link', { name: /Open the demo:/ })).toHaveAttribute('href', expect.stringMatching(/^\/en\/bio\//));
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('a signed-in user without a licence is told the school has none (no sign-in button)', async () => {
    locked(403);
    useSession.setState({ status: 'authed' });
    renderTopicPage('/en/bio/g8/human-heart');
    expect(await screen.findByText(/Your school has no licence for this subject/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
