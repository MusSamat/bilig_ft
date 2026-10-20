import { describe, expect, it, beforeEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { t as tr } from '@bilig/content-model';
import { renderTopic, resetSession } from '../test/utils';
import { useViewer } from '../state/viewer';
import { ConceptCard } from './ConceptCard';

describe('ConceptCard (W-30/W-31)', () => {
  beforeEach(() => {
    resetSession();
  });

  it('overview shows the hint, «Simply put» then «STEM in life» examples, sample properties and «In the model» chips', () => {
    const { pkg } = renderTopic(<ConceptCard />);
    expect(screen.getByText('Topic overview')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Sample properties' }),
    ).toBeInTheDocument();
    const stem = screen.getByRole('region', { name: 'STEM in life' });
    expect(
      within(stem).getByText(tr(pkg.topic.examples.stem[0].title, 'en')),
    ).toBeInTheDocument();
    const simple = screen.getByRole('region', { name: 'Simply put' });
    expect(
      within(simple).getByText(tr(pkg.topic.examples.simple[0].text, 'en')),
    ).toBeInTheDocument();
    // Simple examples come first (easier for 10–14-year-olds).
    expect(
      simple.compareDocumentPosition(stem) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('selected concept: icons by property type, Intl numbers per language, concept examples, actions', () => {
    const { concepts } = renderTopic(<ConceptCard />, { lang: 'ru' });
    const oxygen = concepts.find((c) => c.key === 'chem.oxygen')!;
    act(() => useViewer.getState().select('chem.oxygen'));
    expect(
      screen.getByRole('heading', { level: 2, name: tr(oxygen.title, 'ru') }),
    ).toBeInTheDocument();
    // ru uses a decimal comma: 3.44 → «3,44»
    expect(screen.getByText('3,44')).toBeInTheDocument();
    expect(document.querySelectorAll('.props use').length).toBeGreaterThan(1);
    expect(
      screen.getByRole('region', { name: 'STEM в жизни' }),
    ).toHaveTextContent(tr(oxygen.examples.stem[0].title, 'ru'));
    expect(
      screen.getByRole('region', { name: 'Простыми словами' }),
    ).toHaveTextContent(tr(oxygen.examples.simple[0].title, 'ru'));
    // Presentations are ready-made per topic now: no hand-made «В презентацию» button.
    expect(
      screen.queryByRole('button', { name: 'В презентацию' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Спросить про это' }),
    ).toBeInTheDocument();
  });
});
