import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import i18n from '../i18n';
import { buildCatalog } from '../mocks/data';
import { renderRoutes } from '../test/utils';
import { useLastTextbook } from '../state/textbook';
import { TextbookPlaces } from './TextbookPlaces';

describe('TextbookPlaces (topic badge)', () => {
  beforeEach(() => useLastTextbook.getState().forget());

  it('shows «textbook · § number · pages» linking to the chapter', async () => {
    await act(() => i18n.changeLanguage('ru'));
    renderRoutes('/ru/bio/g8/human-heart', <Route path="*" element={<TextbookPlaces catalog={buildCatalog()} topicKey="human-heart" />} />);
    const link = screen.getByRole('link', { name: /Естественные науки 8 · § 2\.3 · стр\. 48–52/ });
    expect(link).toHaveAttribute('href', '/ru/textbooks/tabigy-ilimder-8-1#tb-ch2');
  });

  it('renders nothing for a topic outside every textbook', async () => {
    await act(() => i18n.changeLanguage('en'));
    const { container } = renderRoutes('/en/x', <Route path="*" element={<TextbookPlaces catalog={buildCatalog()} topicKey="water" />} />);
    expect(container.querySelector('.tb-places')).toBeNull();
  });
});
