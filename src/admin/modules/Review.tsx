/**
 * A-14 review comments. Comments follow the contract's `ReviewCommentSchema`
 * (a field path or a 3D anchor + body). Contract 0.2.1 has NO endpoints to
 * store or list review comments, so they are kept locally per reviewer and
 * sent inside the reject reason when the editor returns the topic for rework
 * (POST /admin/topics/:id/reject, which exists). See CONTRACT_REQUESTS.md.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ReviewCommentSchema, type AdminTopic } from '@bilig/content-model/api';
import { useCanCall } from '../api/hooks';
import { api, useSession } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { usePreviewBridge } from '../lib/preview-bridge';
import { ListView } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { ErrorBox, PageHeader, fmtDate } from '../shell/ui';
import { topicColumns } from './topics/TopicsList';
import { useTopicState } from './topics/useTopic';
import { navIcon } from '../shell/Layout';

export type ReviewComment = z.infer<typeof ReviewCommentSchema> & { createdAt: string };
const KEY = (id: string) => `bilig.admin.review.${id}`;

export function readComments(id: string): ReviewComment[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) ?? '[]');
  } catch {
    return [];
  }
}
function writeComments(id: string, list: ReviewComment[]) {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Reject reason = reviewer summary + the comments (max 2000 chars, RejectRequestSchema). */
export function composeReason(summary: string, comments: readonly ReviewComment[]): string {
  const lines = comments.map((c) => `• ${c.path}${c.anchor3d ? ` @(${c.anchor3d.map((n) => n.toFixed(2)).join(', ')})` : ''}: ${c.body}`);
  const text = [summary.trim(), ...(lines.length ? ['', ...lines] : [])].join('\n').trim();
  return text.length > 2000 ? `${text.slice(0, 1999)}…` : text;
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
      <p className="adm-hint">{t('review.gap')}</p>
      <ListView endpoint="adminTopicList" list={list} extraQuery={{ status: 'review' }} columns={columns} rowKey={(r: AdminTopic) => r.id} onRowClick={(r: AdminTopic) => nav(to(`review/${r.id}`))} />
    </section>
  );
}

export function ReviewTopic() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const { id = '' } = useParams();
  const q = useTopicState(id);
  const canReject = useCanCall('adminTopicReject');
  const getFocus = usePreviewBridge((s) => s.bridge.getCamera);
  const [comments, setComments] = useState<ReviewComment[]>(() => readComments(id));
  const [path, setPath] = useState('');
  const [body, setBody] = useState('');
  const [anchor, setAnchor] = useState<[number, number, number] | undefined>();
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const paths = useMemo(() => (q.data ? docPaths(q.data.doc) : []), [q.data]);
  const save = (list: ReviewComment[]) => {
    setComments(list);
    writeComments(id, list);
  };
  const authorId = useSession((st) => st.me?.id) ?? 'me';
  const candidate = { id: crypto.randomUUID(), authorId, targetType: 'topic' as const, targetId: id, path: path || '$', ...(anchor ? { anchor3d: anchor } : {}), body, createdAt: new Date().toISOString() };
  const valid = ReviewCommentSchema.safeParse(candidate).success && !!body.trim();
  return (
    <section>
      <PageHeader title={`${t('nav.review')} · ${q.data?.detail.key ?? ''}`}>
        <Link className="adm-btn adm-btn--ghost" to={to(`topics/${id}`)}>
          {t('publishing.openEditor')}
        </Link>
      </PageHeader>
      <p className="adm-hint">{t('review.gap')}</p>
      <ErrorBox error={q.error ?? error} />
      <div className="adm-split">
        <div className="adm-split__main">
          <div className="adm-card">
            <h2>{t('review.add')}</h2>
            <label className="adm-field">
              <span>{t('review.field')}</span>
              <input list="adm-review-paths" value={path} onChange={(e) => setPath(e.target.value)} placeholder="title" />
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
            <button type="button" className="adm-btn" disabled={!valid} onClick={() => {
              save([...comments, { ...candidate, createdAt: new Date().toISOString() }]);
              setBody('');
              setAnchor(undefined);
            }}>
              {t('review.addButton')}
            </button>
          </div>
          {canReject && (
            <div className="adm-card">
              <h2>{t('review.return')}</h2>
              <label className="adm-field">
                <span>{t('publishing.reason')}</span>
                <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
              </label>
              <details>
                <summary>{t('review.preview')}</summary>
                <pre className="adm-mono">{composeReason(summary, comments)}</pre>
              </details>
              <button
                type="button"
                className="adm-btn adm-btn--danger"
                disabled={!composeReason(summary, comments) || q.data?.detail.status !== 'review'}
                onClick={async () => {
                  setError(null);
                  try {
                    await api.call('adminTopicReject', { params: { id }, body: { reason: composeReason(summary, comments) } });
                    save([]);
                    setDone(true);
                    void q.refetch();
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
            <h2>{t('review.comments', { count: comments.length })}</h2>
            <ul className="adm-plain">
              {comments.map((c) => (
                <li key={c.id} className="adm-comment">
                  <code>{c.path}</code>
                  {c.anchor3d && <span className="adm-muted"> @{c.anchor3d.join(', ')}</span>}
                  <p>{c.body}</p>
                  <small className="adm-muted">{fmtDate(c.createdAt, lang)}</small>
                  <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => save(comments.filter((x) => x.id !== c.id))}>
                    {t('form.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
