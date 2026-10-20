import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { problem, type MeResponse } from '@bilig/content-model/api';
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

  it('a signed-in user without a licence for the subject is told so and sent to the school administrator (no sign-in button)', async () => {
    locked(403);
    useSession.setState({ status: 'authed' });
    renderTopicPage('/en/bio/g8/human-heart');
    expect(await screen.findByText(/You don’t have access to .+ yet|You don't have access to .+ yet/)).toBeInTheDocument();
    expect(screen.getByText(/contact your school administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  const meWith = (trial: boolean, grades: number[]) =>
    ({ licenses: [{ schoolId: 's1', schoolName: 'School', subjects: ['bio'], grades, startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z', trial }] }) as unknown as MeResponse;

  it('a trial teacher is told the topic’s subject and grade, what they have, and to add a class of that grade', async () => {
    locked(403);
    useSession.setState({ status: 'authed', me: meWith(true, [7]) });
    renderTopicPage('/en/bio/g8/human-heart');
    expect(await screen.findByText(/This topic is .+, grade 8\./)).toBeInTheDocument();
    expect(screen.getByText(/Your access in .+: grade 7\./)).toBeInTheDocument();
    expect(screen.getByText(/add a grade 8 class with/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a grade 8 class' })).toHaveAttribute('href', '/en/teacher?add=8&subject=bio');
  });

  it('a school-licensed teacher is sent to the school administrator, with no add-class button', async () => {
    locked(403);
    useSession.setState({ status: 'authed', me: meWith(false, [7]) });
    renderTopicPage('/en/bio/g8/human-heart');
    expect(await screen.findByText(/contact your school administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add a grade/ })).not.toBeInTheDocument();
  });
});
