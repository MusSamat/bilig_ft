/**
 * A-14 review comments on a topic: a field path ('' = the whole topic) or a
 * point on the 3D model, stored on the server (`/admin/review-comments`)
 * against the version under review. Anyone who may edit the topic's drafts
 * reads, writes, resolves and reopens them; only the author edits the text.
 * Returning the topic sends just the summary: the server keeps the reason as
 * a comment too, and the open comments stay with the topic for the author.
 *
 * Earlier builds (contract 0.2.1) kept comments in this browser; they are
 * offered for upload once and then cleared.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ReviewCommentCreateSchema, type AdminTopic, type ReviewComment } from '@bilig/content-model/api';
import { useApiQuery, useCanCall } from '../api/hooks';
import { api, useSession } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { usePreviewBridge } from '../lib/preview-bridge';
import { ListView } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { Badge, ErrorBox, FilterCheck, PageHeader, fmtDate } from '../shell/ui';
import { topicColumns } from './topics/TopicsList';
import { useTopicState } from './topics/useTopic';
import { navIcon } from '../shell/Layout';

type CommentCreate = z.input<typeof ReviewCommentCreateSchema>;

/** A comment kept in localStorage by the 0.2.1 admin. */
interface LegacyComment {
  path: string;
  anchor3d?: [number, number, number];
  body: string;
}
const LEGACY_KEY = (id: string) => `bilig.admin.review.${id}`;

export function readLegacyComments(id: string): LegacyComment[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY(id)) ?? '[]');
    return Array.isArray(v) ? v.filter((c): c is LegacyComment => !!c && typeof c.body === 'string' && !!c.body.trim()) : [];
  } catch {
    return [];
  }
}
function clearLegacyComments(id: string) {
  try {
    localStorage.removeItem(LEGACY_KEY(id));
  } catch {
    /* ignore */
  }
}

/** Create body for a legacy comment (its `$` placeholder path meant the whole topic). */
export function legacyToCreate(topicId: string, c: LegacyComment): CommentCreate {
  return {
    targetType: 'topic',
    targetId: topicId,
    path: c.path === '$' ? '' : (c.path ?? '').slice(0, 500),
    ...(c.anchor3d ? { anchor3d: c.anchor3d } : {}),
    body: c.body.slice(0, 4000),
  };
}

/** All comments on a topic (open only unless `withResolved`), following the cursor. */
export async function loadTopicComments(topicId: string, withResolved: boolean): Promise<ReviewComment[]> {
  const out: ReviewComment[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const p = await api.call('adminReviewCommentList', { query: { targetType: 'topic', targetId: topicId, limit: 100, ...(withResolved ? {} : { resolved: 'false' }), ...(cursor ? { cursor } : {}) } });
    out.push(...p.items);
    if (!p.nextCursor) break;
    cursor = p.nextCursor;
  }
  return out;
}

/** Leaf paths of a document (for the field picker). */
export function docPaths(doc: unknown, prefix: string[] = [], out: string[] = []): string[] {
  if (doc && typeof doc === 'object') {
    const entries = Array.isArray(doc) ? doc.map((v, i) => [String(i), v] as const) : Object.entries(doc);
    const isLoc = !Array.isArray(doc) && ['ky', 'ru', 'en'].every((k) => k in (doc as object));
    if (isLoc) out.push(prefix.join('.'));
    else for (const [k, v] of entries) docPaths(v, [...prefix, k], out);
  } else if (prefix.length) out.push(prefix.join('.'));
  return out;
}

export function ReviewList() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(['q', 'subjectKey']);
  const columns = useMemo(() => topicColumns(t, lang), [t, lang]);
  return (
    <section>
      <PageHeader title={t('nav.review')} icon={navIcon('review')} description={t('pages.review')} />
      <ListView endpoint="adminTopicList" list={list} extraQuery={{ status: 'review' }} columns={columns} rowKey={(r: AdminTopic) => r.id} onRowClick={(r: AdminTopic) => nav(to(`review/${r.id}`))} />
    </section>
  );
}

function Author({ id }: { id?: string }) {
  const t = useT();
  const me = useSession((st) => st.me?.id);
  const canGet = useCanCall('adminUserGet');
  const q = useApiQuery('adminUserGet', { params: { id: id ?? '' } }, { enabled: !!id && id !== me && canGet, staleTime: 5 * 60_000 });
  if (!id) return <>—</>;
  if (id === me) return <>{t('review.you')}</>;
  return <>{q.data?.displayName ?? id.slice(0, 8)}</>;
}

function CommentItem({ c, canPatch }: { c: ReviewComment; canPatch: boolean }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const qc = useQueryClient();
  const me = useSession((st) => st.me?.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const patch = async (body: { resolved?: boolean; body?: string }) => {
    setBusy(true);
    setError(null);
    try {
      await api.call('adminReviewCommentPatch', { params: { id: c.id }, body });
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['adminReviewCommentList'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`adm-comment${c.resolvedAt ? ' is-resolved' : ''}`} data-testid={`comment-${c.id}`}>
      <div className="adm-inline">
        <code>{c.path || t('review.wholeTopic')}</code>
        {c.anchor3d && <span className="adm-muted"> @{c.anchor3d.map((n) => n.toFixed(2)).join(', ')}</span>}
        {c.topicVersion && <Badge>{c.topicVersion}</Badge>}
        {c.resolvedAt && <Badge tone="ok">{t('review.resolved')}</Badge>}
      </div>
      {editing === null ? (
        <p>{c.body}</p>
      ) : (
        <label className="adm-field">
          <span>{t('review.body')}</span>
          <textarea rows={3} maxLength={4000} value={editing} onChange={(e) => setEditing(e.target.value)} />
        </label>
      )}
      <small className="adm-muted">
        <Author id={c.authorId} /> · {fmtDate(c.createdAt, lang)}
        {c.resolvedAt && (
          <>
            {' · '}
            {t('review.resolvedBy')} <Author id={c.resolvedBy} /> · {fmtDate(c.resolvedAt, lang)}
          </>
        )}
      </small>
      <ErrorBox error={error} />
      {canPatch && (
        <div className="adm-inline">
          {editing === null ? (
            <>
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" disabled={busy} onClick={() => patch({ resolved: !c.resolvedAt })}>
                {c.resolvedAt ? t('review.reopen') : t('review.resolve')}
              </button>
              {c.authorId === me && (
                <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => setEditing(c.body)}>
                  {t('common.edit')}
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="adm-btn adm-btn--small" disabled={busy || !editing.trim() || editing === c.body} onClick={() => patch({ body: editing })}>
                {t('common.save')}
              </button>
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** One-time upload of comments an earlier build kept in this browser. */
function LegacyComments({ id, canCreate }: { id: string; canCreate: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [legacy, setLegacy] = useState(() => readLegacyComments(id));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!legacy.length) return null;
  const upload = async () => {
    setBusy(true);
    setError(null);
    let left = legacy;
    try {
      for (const c of legacy) {
        await api.call('adminReviewCommentCreate', { body: legacyToCreate(id, c) });
        left = left.slice(1);
      }
      clearLegacyComments(id);
      setLegacy([]);
    } catch (e) {
      // Keep only what was not uploaded, so a retry does not duplicate.
      try {
        localStorage.setItem(LEGACY_KEY(id), JSON.stringify(left));
      } catch {
        /* ignore */
      }
      setLegacy(left);
      setError(e);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ['adminReviewCommentList'] });
    }
  };
  return (
    <div className="adm-alert adm-alert--warn" role="status">
      <span>{t('review.legacy', { count: legacy.length })}</span>
      {canCreate && (
        <button type="button" className="adm-btn adm-btn--small" disabled={busy} onClick={upload}>
          {t('review.legacyUpload', { count: legacy.length })}
        </button>
      )}
      <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" disabled={busy} onClick={() => { clearLegacyComments(id); setLegacy([]); }}>
        {t('review.legacyDiscard')}
      </button>
      <ErrorBox error={error} />
    </div>
  );
}

export function ReviewTopic() {
  const t = useT();
  const to = useAdminPath();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const q = useTopicState(id);
  const canReject = useCanCall('adminTopicReject');
  const canCreate = useCanCall('adminReviewCommentCreate');
  const canPatch = useCanCall('adminReviewCommentPatch');
  const canList = useCanCall('adminReviewCommentList');
  const getFocus = usePreviewBridge((s) => s.bridge.getCamera);
  const [showResolved, setShowResolved] = useState(false);
  const comments = useQuery({ queryKey: ['adminReviewCommentList', id, showResolved], queryFn: () => loadTopicComments(id, showResolved), enabled: canList });
  const [path, setPath] = useState('');
  const [body, setBody] = useState('');
  const [anchor, setAnchor] = useState<[number, number, number] | undefined>();
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const paths = useMemo(() => (q.data ? docPaths(q.data.doc) : []), [q.data]);
  const version = q.data?.detail.latestVersion;
  const candidate: CommentCreate = { targetType: 'topic', targetId: id, path, ...(anchor ? { anchor3d: anchor } : {}), body, ...(version ? { topicVersion: version } : {}) };
  const valid = ReviewCommentCreateSchema.safeParse(candidate).success;
  const items = comments.data ?? [];
  const open = items.filter((c) => !c.resolvedAt).length;
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.call('adminReviewCommentCreate', { body: candidate });
      setBody('');
      setAnchor(undefined);
      await qc.invalidateQueries({ queryKey: ['adminReviewCommentList'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <PageHeader title={`${t('nav.review')} · ${q.data?.detail.key ?? ''}`}>
        <Link className="adm-btn adm-btn--ghost" to={to(`topics/${id}`)}>
          {t('publishing.openEditor')}
        </Link>
      </PageHeader>
      <LegacyComments id={id} canCreate={canCreate} />
      <ErrorBox error={q.error ?? error} />
      <div className="adm-split">
        <div className="adm-split__main">
          {canCreate && (
            <div className="adm-card">
              <h2>{t('review.add')}</h2>
              <label className="adm-field">
                <span>{t('review.field')}</span>
                <input list="adm-review-paths" value={path} maxLength={500} onChange={(e) => setPath(e.target.value)} placeholder={t('review.wholeTopic')} />
                <datalist id="adm-review-paths">
                  {paths.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <div className="adm-inline">
                <span>{t('review.anchor')}</span>
                {[0, 1, 2].map((i) => (
                  <input key={i} type="number" step="any" aria-label={['x', 'y', 'z'][i]} style={{ width: '6em' }} value={anchor?.[i] ?? ''} onChange={(e) => {
                    const a: [number, number, number] = anchor ? [...anchor] : [0, 0, 0];
                    a[i] = Number(e.target.value);
                    setAnchor(a);
                  }} />
                ))}
                <button type="button" className="adm-btn adm-btn--small" disabled={!getFocus} title={getFocus ? undefined : t('preview.needsViewer')} onClick={() => { const c = getFocus?.(); if (c) setAnchor(c.target); }}>
                  {t('review.pickPoint')}
                </button>
              </div>
              <label className="adm-field">
                <span>{t('review.body')}</span>
                <textarea rows={3} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
              </label>
              <button type="button" className="adm-btn" disabled={!valid || busy} onClick={add}>
                {t('review.addButton')}
              </button>
            </div>
          )}
          {canReject && (
            <div className="adm-card">
              <h2>{t('review.return')}</h2>
              <label className="adm-field">
                <span>{t('publishing.reason')}</span>
                <textarea rows={3} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} />
              </label>
              <p className="adm-hint">{t('review.returnHint', { count: open })}</p>
              <button
                type="button"
                className="adm-btn adm-btn--danger"
                disabled={!summary.trim() || q.data?.detail.status !== 'review'}
                onClick={async () => {
                  setError(null);
                  try {
                    await api.call('adminTopicReject', { params: { id }, body: { reason: summary.trim() } });
                    setSummary('');
                    setDone(true);
                    void q.refetch();
                    void qc.invalidateQueries({ queryKey: ['adminReviewCommentList'] });
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {t('review.returnButton')}
              </button>
              {done && <p className="adm-alert adm-alert--info">{t('review.returned')}</p>}
            </div>
          )}
        </div>
        <aside className="adm-split__side">
          <div className="adm-card">
            <h2>{t('review.comments', { count: showResolved ? items.length : open })}</h2>
            <FilterCheck label={t('review.showResolved')} value={showResolved ? 'true' : undefined} onApply={(v) => setShowResolved(v === 'true')} />
            <ErrorBox error={comments.error} />
            {comments.isLoading && <p className="adm-muted">{t('common.loading')}</p>}
            {!comments.isLoading && !items.length && <p className="adm-muted">{t('review.none')}</p>}
            <ul className="adm-plain">
              {items.map((c) => (
                <CommentItem key={c.id} c={c} canPatch={canPatch} />
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
