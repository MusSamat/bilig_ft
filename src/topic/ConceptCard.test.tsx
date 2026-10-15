import { describe, expect, it, beforeEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t as tr } from '@bilig/content-model';
import { renderTopic, resetSession } from '../test/utils';
import { useDeck } from '../state/deck';
import { useViewer } from '../state/viewer';
import { ConceptCard } from './ConceptCard';

describe('ConceptCard (W-30/W-31)', () => {
  beforeEach(() => {
    resetSession();
    useDeck.setState({ slides: [], title: '', topicKey: '' });
  });

  it('overview shows sample properties, «In the model» chips and the topic STEM / Simply put examples', () => {
    const { pkg } = renderTopic(<ConceptCard />);
    expect(screen.getByRole('heading', { name: 'Topic overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sample properties' })).toBeInTheDocument();
    const stem = screen.getByRole('region', { name: 'STEM in life' });
    expect(within(stem).getByText(tr(pkg.topic.examples.stem[0].title, 'en'))).toBeInTheDocument();
    const simple = screen.getByRole('region', { name: 'Simply put' });
    expect(within(simple).getByText(tr(pkg.topic.examples.simple[0].text, 'en'))).toBeInTheDocument();
  });

  it('selected concept: icons by property type, Intl numbers per language, concept examples, actions work', async () => {
    const user = userEvent.setup();
    const { pkg, concepts } = renderTopic(<ConceptCard />, { lang: 'ru' });
    const oxygen = concepts.find((c) => c.key === 'chem.oxygen')!;
    act(() => useViewer.getState().select('chem.oxygen'));
    expect(screen.getByRole('heading', { level: 2, name: tr(oxygen.title, 'ru') })).toBeInTheDocument();
    // ru uses a decimal comma: 3.44 → «3,44»
    expect(screen.getByText('3,44')).toBeInTheDocument();
    expect(document.querySelectorAll('.props use').length).toBeGreaterThan(1);
    expect(screen.getByRole('region', { name: 'STEM в жизни' })).toHaveTextContent(tr(oxygen.examples.stem[0].title, 'ru'));
    expect(screen.getByRole('region', { name: 'Проще говоря' })).toHaveTextContent(tr(oxygen.examples.simple[0].title, 'ru'));
    await user.click(screen.getByRole('button', { name: 'В презентацию' }));
    expect(useDeck.getState().slides).toMatchObject([{ kind: 'concept', conceptKey: 'chem.oxygen' }]);
    expect(useDeck.getState().topicKey).toBe(pkg.topic.key);
    expect(screen.getByRole('button', { name: 'Спросить помощника' })).toBeInTheDocument();
  });
});
