/**
 * Contract 0.3.0 in the content screens: asset multipart completion, versions
 * and delete (A-05), scheduled-publish cancel and the rights warning (A-13),
 * concept `usedBy` (A-04), rights helpers (A-06) and `null` removals in patches.
 */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminConceptPatchSchema } from '@bilig/content-model/api';
import { animalCellPackage as pkg } from '@bilig/content-model/fixtures/animal-cell';
import type { Topic } from '@bilig/content-model';
import { withRemovals } from '../forms/zod-utils';
import { fail, mockApi, page, renderAdmin } from '../test/utils';
import { completedParts, pushUpload, usedByOf } from './Assets';
import { usageRefs } from './Dictionary';
import { coverOptions, rightsMissing } from './topics/TopicEditor';
import { ApiError } from '../api/client';

configure({ asyncUtilTimeout: 5000 });

const ASSET_ID = '00000000-0000-4000-8000-000000000005';
const TOPIC_ID = '00000000-0000-4000-8000-000000000006';
const USER_ID = '00000000-0000-4000-8000-000000000004';
const now = '2026-10-15T10:00:00.000Z';
const asset = {
  id: ASSET_ID,
  key: 'animal-cell-000005',
  status: 'ready',
  sizeBefore: 4_000_000,
  nodes: [],
  violations: [],
  filename: 'cell.glb',
  kind: 'glb',
  contentType: 'model/gltf-binary',
  license: 'CC-BY-4.0',
  author: 'Bilig',
  source: 'https://bilig.kg',
  createdAt: now,
  createdBy: USER_ID,
  version: 2,
  completedAt: now,
};
const versionRow = (version: number, current: boolean) => ({ assetId: ASSET_ID, version, filename: `cell-v${version}.glb`, contentType: 'model/gltf-binary', status: 'ready', sizeBefore: 1000, nodes: [], violations: [], createdAt: now, createdBy: USER_ID, current, ...(current ? { completedAt: now } : {}) });

describe('A-05 multipart upload', () => {
  it('sends the parts, completes with their ETags, then processes', async () => {
    const m = mockApi({
      'POST /admin/assets/:id/complete': { body: asset },
      'POST /admin/assets/:id/process': { body: asset },
    });
    // Part PUTs go straight to the storage (binary bodies), outside the API mock.
    const parts: string[] = [];
    const apiFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://s3.test/')) return apiFetch(input, init);
      parts.push(url);
      return new Response(null, { status: 200, headers: { ETag: `"etag-${url.slice(-1)}"` } });
    });
    const file = new File(['abcdef'], 'cell.glb');
    const progress: number[] = [];
    const id = await pushUpload(file, { assetId: ASSET_ID, uploadId: 'up-1', partUrls: ['https://s3.test/bucket/p1', 'https://s3.test/bucket/p2'], partSize: 3, done: [], etags: {} }, (p) => progress.push(p));
    expect(id).toBe(ASSET_ID);
    expect(progress).toEqual([0.5, 1]);
    expect(parts).toEqual(['https://s3.test/bucket/p1', 'https://s3.test/bucket/p2']);
    const complete = m.find('POST', `/admin/assets/${ASSET_ID}/complete`);
    expect(complete).toHaveLength(1);
    expect(complete[0].body).toEqual({ uploadId: 'up-1', parts: [{ partNumber: 1, etag: '"etag-1"' }, { partNumber: 2, etag: '"etag-2"' }] });
    const order = m.calls.map((c) => `${c.method} ${c.path}`);
    expect(order.indexOf(`POST /admin/assets/${ASSET_ID}/complete`)).toBeLessThan(order.indexOf(`POST /admin/assets/${ASSET_ID}/process`));
  });

  it('local storage (no part URLs) completes with no parts; resumed parts keep their ETags', () => {
    expect(completedParts({ partUrls: [], etags: {} })).toEqual([]);
    expect(completedParts({ partUrls: ['a', 'b'], etags: { 0: 'x', 1: 'y' } })).toEqual([{ partNumber: 1, etag: 'x' }, { partNumber: 2, etag: 'y' }]);
  });
});

describe('A-05 asset report', () => {
  const routes = (extra = {}) =>
    mockApi({
      'GET /admin/assets/:id': { body: asset },
      'GET /admin/assets/:id/versions': { body: { items: [versionRow(1, false), versionRow(2, true)] } },
      ...extra,
    });

  it('shows the upload metadata and the file versions', async () => {
    routes();
    renderAdmin('/admin/assets/' + ASSET_ID);
    expect(await screen.findByText('CC-BY-4.0')).toBeInTheDocument();
    expect(screen.getByText('https://bilig.kg')).toBeInTheDocument();
    expect(await screen.findByText('cell-v2.glb')).toBeInTheDocument();
    const current = screen.getByText('текущая').closest('tr')!;
    expect(within(current).getByText('cell-v2.glb')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Новая версия файла' })).toBeInTheDocument();
  });

  it('delete refused with 409 in_use lists the topics that use the asset', async () => {
    const m = routes({ 'DELETE /admin/assets/:id': fail('in_use', { detail: 'topic:animal-cell, topic:plant-cell' }) });
    renderAdmin('/admin/assets/' + ASSET_ID);
    await screen.findByText('CC-BY-4.0');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(m.find('DELETE', `/admin/assets/${ASSET_ID}`)).toHaveLength(1));
    expect(await within(dialog).findByText('topic:animal-cell')).toBeInTheDocument();
    expect(within(dialog).getByText('topic:plant-cell')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Удалить' })).toBeDisabled();
  });

  it('usedByOf reads only in_use problems', () => {
    expect(usedByOf(new ApiError(409, { type: 'x', title: 't', status: 409, code: 'in_use', detail: 'topic:a, topic:b' } as never, 'adminAssetDelete'))).toEqual(['topic:a', 'topic:b']);
    expect(usedByOf(new Error('x'))).toEqual([]);
  });
});

describe('A-13 scheduled publish', () => {
  const row = { id: TOPIC_ID, key: pkg.topic.key, unitKey: pkg.topic.unitKey, status: 'review', publishedVersion: '1.0.0', latestVersion: '1.1.0', updatedAt: now, version: 5 };
  const detail = { ...row, demo: false, subjectKey: pkg.subject.key, availableActions: ['reject', 'approve', 'publish'], scheduledAt: '2026-11-01T06:00:00.000Z' };
  const checklist = { schema: true, translations: true, budgets: true, altText: true, issues: [{ path: ['topic', 'rights'], code: 'rights_missing', message: 'rights missing', severity: 'warning' }] };

  it('cancels the schedule with If-Match and links the rights warning to the editor tab', async () => {
    let scheduled = true;
    const m = mockApi({
      'GET /admin/topics/:id': () => ({ body: scheduled ? detail : { ...detail, scheduledAt: undefined, version: 6 } }),
      'GET /admin/topics/:id/versions': { body: { items: [] } },
      'GET /admin/topics/:id/checklist': { body: checklist },
      'GET /admin/builds': { body: page([]) },
      'DELETE /admin/topics/:id/schedule': () => {
        scheduled = false;
        return { body: { topicKey: row.key, status: 'review', version: '1.1.0' } };
      },
    });
    renderAdmin('/admin/publishing/' + TOPIC_ID);
    expect(await screen.findByText('У 3D-ассета темы нет записи о правах (лицензия, автор, источник).')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть «Права и источники»' })).toHaveAttribute('href', `/admin/topics/${TOPIC_ID}?tab=rights`);
    fireEvent.click(await screen.findByRole('button', { name: 'Отменить расписание' }));
    await waitFor(() => expect(m.find('DELETE', `/admin/topics/${TOPIC_ID}/schedule`)).toHaveLength(1));
    expect(m.find('DELETE', `/admin/topics/${TOPIC_ID}/schedule`)[0].headers['if-match']).toBe('"5"');
    expect(await screen.findByText('Публикация по расписанию отменена, тема осталась на проверке.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Отменить расписание' })).toBeNull());
  });

  it('the bulk unit filter goes to the server', async () => {
    const m = mockApi({ 'GET /admin/topics': { body: page([row]) }, 'GET /admin/units': { body: page([]) }, 'GET /admin/subjects': { body: page([]) } });
    renderAdmin('/admin/publishing?unitKey=bio.cells');
    await screen.findByText(row.key);
    expect(m.find('GET', '/admin/topics').some((c) => c.query.get('unitKey') === 'bio.cells')).toBe(true);
  });
});

describe('A-04 concept usage', () => {
  it('usedBy lists topics, processes and related concepts; older servers fall back to topicKeys', () => {
    expect(usageRefs({ topicKeys: ['animal-cell'], usedBy: ['topic:animal-cell', 'process:bio.respiration', 'concept:bio.nucleus'] })).toEqual([
      { type: 'topic', key: 'animal-cell' },
      { type: 'process', key: 'bio.respiration' },
      { type: 'concept', key: 'bio.nucleus' },
    ]);
    expect(usageRefs({ topicKeys: ['animal-cell'] })).toEqual([{ type: 'topic', key: 'animal-cell' }]);
  });
});

describe('A-06 rights', () => {
  const doc = { ...pkg.topic, scene: { ...pkg.topic.scene, plugin: 'gltf', asset: 'models/cell.glb' } } as Topic;

  it('warns when the scene asset has no covering entry', () => {
    expect(rightsMissing({ ...doc, rights: [] })).toBe(true);
    expect(rightsMissing({ ...doc, rights: [{ license: 'CC0-1.0', author: 'a', source: 's', covers: 'models/cell.glb' }] })).toBe(false);
    expect(rightsMissing({ ...doc, rights: [{ license: 'CC0-1.0', author: 'a', source: 's' }] })).toBe(false);
    expect(rightsMissing({ ...doc, scene: { ...doc.scene, asset: undefined } } as Topic)).toBe(false);
  });

  it('covers suggests the scene asset first', () => {
    expect(coverOptions(doc)[0]).toEqual({ value: 'models/cell.glb' });
  });
});

describe('null removals in patches (0.3.0)', () => {
  const concept = pkg.concepts.find((c) => c.subtitle) ?? { ...pkg.concepts[0], subtitle: { ky: 'a', ru: 'a', en: 'a' } };
  const { subtitle: _s, ...cleared } = concept;

  it('a cleared optional field is sent as null and the body still matches the patch schema', () => {
    const body: Record<string, unknown> = { ...withRemovals(AdminConceptPatchSchema, cleared as Record<string, unknown>, concept as Record<string, unknown>), version: 3 };
    expect(body.subtitle).toBeNull();
    expect(AdminConceptPatchSchema.safeParse(body).success).toBe(true);
  });

  it('with a base, fields that were never set are left out; required fields are never nulled', () => {
    const body = withRemovals(AdminConceptPatchSchema, cleared as Record<string, unknown>, cleared as Record<string, unknown>);
    expect('subtitle' in body).toBe(false);
    const { key: _k, ...noKey } = cleared as Record<string, unknown>;
    expect(withRemovals(AdminConceptPatchSchema, noKey).key).toBeUndefined();
  });
});
