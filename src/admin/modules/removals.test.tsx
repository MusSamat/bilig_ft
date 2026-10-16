/** Clearing an optional field in a dictionary editor sends `null`, so the server removes it (contract 0.3.0, #6). */
import { configure, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { animalCellPackage as pkg } from '@bilig/content-model/fixtures/animal-cell';
import { mockApi, rec, renderAdmin } from '../test/utils';

configure({ asyncUtilTimeout: 5000 });

describe('#6 null removals in patches', () => {
  it('a cleared optional localized field goes out as null; untouched absent fields are not sent', async () => {
    const concept = { ...pkg.concepts[0], subtitle: { ky: 'к', ru: 'р', en: 'e' } };
    const api = mockApi({
      'GET /admin/concepts/:key': { body: rec(concept, 4) },
      'GET /admin/concepts/:key/usage': (_c, p) => ({ body: { conceptKey: p.key, topicKeys: [], usedBy: [] } }),
      'PATCH /admin/concepts/:key': () => ({ body: rec({ ...concept, subtitle: undefined }, 5) }),
    });
    renderAdmin(`/admin/concepts/${concept.key}`);
    const field = await waitFor(() => {
      const f = document.querySelector('[data-path="subtitle"]');
      if (!f) throw new Error('subtitle field not rendered');
      return f;
    });
    for (const input of field.querySelectorAll('input, textarea')) fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(await screen.findByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.find('PATCH', `/admin/concepts/${concept.key}`)).toHaveLength(1));
    const body = api.find('PATCH', `/admin/concepts/${concept.key}`)[0].body as Record<string, unknown>;
    expect(body.subtitle).toBeNull();
    expect(body.version).toBe(4);
    for (const k of ['container', 'misconceptions'] as const) if (!(k in concept)) expect(k in body).toBe(false);
  });
});
