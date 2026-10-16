/**
 * A-05 3D assets: register an upload (licence, author, source are required by
 * the schema), push the file in parts to the presigned URLs (resumable: the
 * parts already sent and their ETags are remembered per file), complete the
 * multipart upload, queue processing, view the report (metadata, size
 * before/after, triangles, node tree, budget violations), the file versions
 * (a new file for the same key, rights may change with it) and delete (refused
 * with 409 `in_use` while a topic references the key).
 * Processing is a backend stub until bilig_worker exists.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ASSET_KINDS,
  ASSET_STATUSES,
  AssetUploadRequestSchema,
  AssetVersionCreateRequestSchema,
  type AssetReport,
  type AssetUploadRequest,
  type AssetVersion,
} from '@bilig/content-model/api';
import { ApiError } from '../api/client';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { Badge, Dialog, ErrorBox, FilterSelect, FilterText, KeyValue, PageHeader, StatusBadge, fmtDate, fmtNum } from '../shell/ui';
import { navIcon } from '../shell/Layout';

const MB = 1024 * 1024;
const fmtSize = (n: number | undefined, lang: string) => (n === undefined ? '—' : `${fmtNum(n / MB, lang, { maximumFractionDigits: 2 })} MB`);

interface UploadState {
  assetId: string;
  uploadId: string;
  partUrls: string[];
  partSize: number;
  done: number[];
  /** ETag of each sent part, by 0-based part index (S3 needs them to complete). */
  etags: Record<number, string>;
}
/** Resume slot: a new asset, or a new version of `assetId`. */
const fileId = (f: File, assetId?: string) => `bilig.admin.upload.${assetId ? `${assetId}.` : ''}${f.name}.${f.size}.${f.lastModified}`;
const readUpload = (f: File, assetId?: string): UploadState | null => {
  try {
    const s = JSON.parse(localStorage.getItem(fileId(f, assetId)) ?? 'null') as UploadState | null;
    return s && s.uploadId !== undefined ? { ...s, etags: s.etags ?? {} } : null;
  } catch {
    return null;
  }
};
const writeUpload = (f: File, s: UploadState | null, assetId?: string) => {
  try {
    if (s) localStorage.setItem(fileId(f, assetId), JSON.stringify(s));
    else localStorage.removeItem(fileId(f, assetId));
  } catch {
    /* ignore */
  }
};

export const kindOf = (name: string): AssetUploadRequest['kind'] => (/\.(glb|gltf)$/i.test(name) ? 'glb' : /\.mol$/i.test(name) ? 'molfile' : 'image');
const fileMeta = (f: File) => ({ filename: f.name, size: f.size, contentType: f.type || 'model/gltf-binary' });

/** Parts for POST /complete: 1-based, in order, with the ETag each part PUT returned. */
export function completedParts(st: Pick<UploadState, 'partUrls' | 'etags'>): { partNumber: number; etag: string }[] {
  return st.partUrls.map((_, i) => ({ partNumber: i + 1, etag: st.etags[i] ?? '' }));
}

/**
 * Send the remaining parts, complete the multipart upload and queue processing.
 * Local-disk storage returns no part URLs: then `parts` is empty.
 */
export async function pushUpload(file: File, start: UploadState, onProgress: (p: number) => void, assetId?: string): Promise<string> {
  let st = start;
  for (let i = 0; i < st.partUrls.length; i++) {
    if (st.done.includes(i)) continue;
    const blob = file.slice(i * st.partSize, (i + 1) * st.partSize);
    const res = await fetch(st.partUrls[i], { method: 'PUT', body: blob });
    if (!res.ok) throw new Error(`part ${i + 1}: HTTP ${res.status}`);
    // The bucket's CORS must expose ETag, or the upload cannot be completed.
    const etag = res.headers.get('ETag');
    if (!etag) throw new Error(`part ${i + 1}: no ETag (bucket CORS must expose it)`);
    st = { ...st, done: [...st.done, i], etags: { ...st.etags, [i]: etag } };
    writeUpload(file, st, assetId);
    onProgress(st.done.length / st.partUrls.length);
  }
  await api.call('adminAssetComplete', { params: { id: st.assetId }, body: { uploadId: st.uploadId, parts: completedParts(st) } });
  await api.call('adminAssetProcess', { params: { id: st.assetId }, body: {} });
  writeUpload(file, null, assetId);
  return st.assetId;
}

function Upload() {
  const t = useT();
  const nav = useNavigate();
  const to = useAdminPath();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Partial<AssetUploadRequest>>({ license: '', author: '', source: '' });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const issues = useValidation(AssetUploadRequestSchema, meta);
  const resumable = file ? readUpload(file) : null;

  const start = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      let st = readUpload(file);
      if (!st) {
        const r = await api.call('adminAssetUpload', { body: meta as AssetUploadRequest });
        st = { assetId: r.assetId, uploadId: r.uploadId, partUrls: r.partUrls, partSize: r.partSize, done: [], etags: {} };
        writeUpload(file, st);
      }
      const id = await pushUpload(file, st, setProgress);
      void qc.invalidateQueries({ queryKey: ['adminAssetList'] });
      nav(to(`assets/${id}`));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-card">
      <h2>{t('assets.upload')}</h2>
      <input
        type="file"
        accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.mol"
        aria-label={t('assets.file')}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          setProgress(null);
          if (f) setMeta((m) => ({ ...m, ...fileMeta(f), kind: kindOf(f.name) }));
        }}
      />
      <SchemaForm schema={AssetUploadRequestSchema} value={meta} onChange={setMeta} hidden={['size']} />
      {resumable && <p className="adm-alert adm-alert--info">{t('assets.resume', { done: resumable.done.length, total: resumable.partUrls.length })}</p>}
      {progress !== null && <progress max={1} value={progress} aria-label={t('assets.progress')} />}
      <ErrorBox error={error} />
      <button type="button" className="adm-btn adm-btn--primary" disabled={!file || busy || issues.length > 0} onClick={start}>
        {resumable ? t('assets.resumeButton') : t('assets.start')}
      </button>
      <p className="adm-hint">{t('assets.stubNote')}</p>
    </div>
  );
}

const ASSET_FILTERS = ['q', 'kind', 'status'];

export function AssetsList() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams(ASSET_FILTERS);
  const canUpload = useCanCall('adminAssetUpload');
  const columns = useMemo<Column<AssetReport>[]>(
    () => [
      { key: 'key', header: t('fields.key'), render: (a) => <code>{a.key}</code>, sortValue: (a) => a.key },
      { key: 'filename', header: t('fields.filename'), render: (a) => a.filename ?? '—', sortValue: (a) => a.filename },
      { key: 'status', header: t('fields.status'), render: (a) => <StatusBadge status={a.status} />, sortValue: (a) => a.status },
      { key: 'sizeBefore', header: t('assets.sizeBefore'), render: (a) => fmtSize(a.sizeBefore, lang), sortValue: (a) => a.sizeBefore },
      { key: 'sizeAfter', header: t('assets.sizeAfter'), render: (a) => fmtSize(a.sizeAfter, lang), sortValue: (a) => a.sizeAfter },
      { key: 'triangles', header: t('assets.triangles'), render: (a) => fmtNum(a.triangles, lang), sortValue: (a) => a.triangles },
      { key: 'violations', header: t('assets.violations'), render: (a) => (a.violations.length ? <StatusBadge status="failed" /> : '—'), sortValue: (a) => a.violations.length },
      { key: 'createdAt', header: t('fields.createdAt'), render: (a) => fmtDate(a.createdAt, lang), sortValue: (a) => a.createdAt },
    ],
    [t, lang],
  );
  return (
    <section>
      <PageHeader title={t('nav.assets')} icon={navIcon('assets')} description={t('pages.assets')} />
      {canUpload && <Upload />}
      <div className="adm-filters">
        <FilterText label={t('list.search')} value={list.filters.q} onApply={(v) => list.setFilter('q', v)} />
        <FilterSelect label={t('assets.kind')} value={list.filters.kind} options={ASSET_KINDS.map((k) => ({ value: k, label: t(`assets.kinds.${k}`) }))} onApply={(v) => list.setFilter('kind', v)} />
        <FilterSelect label={t('fields.status')} value={list.filters.status} options={ASSET_STATUSES.map((s) => ({ value: s, label: t(`enum.${s}`, { defaultValue: s }) }))} onApply={(v) => list.setFilter('status', v)} />
      </div>
      <ListView endpoint="adminAssetList" list={list} columns={columns} rowKey={(a: AssetReport) => a.id} onRowClick={(a: AssetReport) => nav(to(`assets/${a.id}`))} />
    </section>
  );
}

/** Node names → nested tree (path separators `/` or `|`). */
export function nodeTree(nodes: readonly string[]): Map<string, Map<string, unknown>> {
  const root = new Map<string, Map<string, unknown>>();
  for (const n of nodes) {
    let cur = root as Map<string, unknown>;
    for (const part of n.split(/[/|]/).filter(Boolean)) {
      if (!cur.has(part)) cur.set(part, new Map());
      cur = cur.get(part) as Map<string, unknown>;
    }
  }
  return root;
}

function Tree({ node }: { node: Map<string, unknown> }) {
  return (
    <ul className="adm-tree">
      {[...node.entries()].map(([k, v]) => (
        <li key={k}>
          <code>{k}</code>
          {(v as Map<string, unknown>).size > 0 && <Tree node={v as Map<string, unknown>} />}
        </li>
      ))}
    </ul>
  );
}

/** `in_use` detail → the references (`topic:<key>`, comma separated). */
export const usedByOf = (e: unknown): string[] => (e instanceof ApiError && e.code === 'in_use' && e.detail ? e.detail.split(/,\s*/).filter(Boolean) : []);

function NewVersion({ asset, onDone }: { asset: AssetReport; onDone(): void }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // Empty rights fields keep the asset's current ones.
  const body = useMemo(() => Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== '' && v !== undefined)), [meta]);
  const issues = useValidation(AssetVersionCreateRequestSchema, body);
  const resumable = file ? readUpload(file, asset.id) : null;
  const start = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      let st = readUpload(file, asset.id);
      if (!st) {
        const r = await api.call('adminAssetVersionCreate', { params: { id: asset.id }, body: body as never });
        st = { assetId: r.assetId, uploadId: r.uploadId, partUrls: r.partUrls, partSize: r.partSize, done: [], etags: {} };
        writeUpload(file, st, asset.id);
      }
      await pushUpload(file, st, setProgress, asset.id);
      setFile(null);
      setMeta({});
      setProgress(null);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="adm-card">
      <h2>{t('assets.newVersion')}</h2>
      <input
        type="file"
        accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.mol"
        aria-label={t('assets.file')}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          setProgress(null);
          if (f) setMeta((m) => ({ ...m, ...fileMeta(f) }));
        }}
      />
      <SchemaForm schema={AssetVersionCreateRequestSchema} value={meta} onChange={setMeta} hidden={['size', 'filename', 'contentType']} />
      <p className="adm-hint">{t('assets.rightsKept', { license: asset.license ?? '—', author: asset.author ?? '—' })}</p>
      {resumable && <p className="adm-alert adm-alert--info">{t('assets.resume', { done: resumable.done.length, total: resumable.partUrls.length })}</p>}
      {progress !== null && <progress max={1} value={progress} aria-label={t('assets.progress')} />}
      <ErrorBox error={error} />
      <button type="button" className="adm-btn adm-btn--primary" disabled={!file || busy || issues.length > 0} onClick={start}>
        {resumable ? t('assets.resumeButton') : t('assets.uploadVersion')}
      </button>
    </div>
  );
}

function Versions({ id }: { id: string }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const q = useApiQuery('adminAssetVersions', { params: { id } });
  const items = [...(q.data?.items ?? [])].sort((a, b) => b.version - a.version);
  return (
    <div className="adm-card">
      <h2>{t('assets.versions')}</h2>
      <ErrorBox error={q.error} />
      <div className="adm-tablewrap">
        <table className="adm-table adm-table--compact">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('fields.filename')}</th>
              <th>{t('fields.status')}</th>
              <th>{t('assets.sizeBefore')}</th>
              <th>{t('assets.sizeAfter')}</th>
              <th>{t('fields.createdAt')}</th>
              <th>{t('assets.message')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v: AssetVersion) => (
              <tr key={v.version}>
                <td>
                  {v.version} {v.current && <Badge tone="ok">{t('assets.current')}</Badge>}
                </td>
                <td>{v.filename}</td>
                <td>
                  <StatusBadge status={v.status} />
                  {!v.completedAt && <span className="adm-muted"> · {t('assets.notCompleted')}</span>}
                </td>
                <td>{fmtSize(v.sizeBefore, lang)}</td>
                <td>{fmtSize(v.sizeAfter, lang)}</td>
                <td>{fmtDate(v.createdAt, lang)}</td>
                <td className="adm-muted">{v.message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeleteAsset({ asset }: { asset: AssetReport }) {
  const t = useT();
  const nav = useNavigate();
  const to = useAdminPath();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const usedBy = usedByOf(error);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.call('adminAssetDelete', { params: { id: asset.id } });
      void qc.invalidateQueries({ queryKey: ['adminAssetList'] });
      nav(to('assets'));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="adm-btn adm-btn--danger" onClick={() => setOpen(true)}>
        {t('common.delete')}
      </button>
      {open && (
        <Dialog
          title={t('assets.deleteTitle', { key: asset.key })}
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="adm-btn adm-btn--danger" disabled={busy || usedBy.length > 0} onClick={run}>
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('assets.deleteConfirm')}</p>
          {usedBy.length > 0 ? (
            <div className="adm-alert adm-alert--error" role="alert">
              <strong>{t('assets.inUse')}</strong>
              <ul>
                {usedBy.map((u) => (
                  <li key={u}>
                    <code>{u}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ErrorBox error={error} />
          )}
        </Dialog>
      )}
    </>
  );
}

export function AssetReportPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const q = useApiQuery('adminAssetGet', { params: { id } }, { refetchInterval: (query) => ((query.state.data as AssetReport | undefined)?.status === 'processing' ? 3000 : false) });
  const process = useApiMutation('adminAssetProcess', ['adminAssetGet', 'adminAssetList', 'adminAssetVersions']);
  const canProcess = useCanCall('adminAssetProcess');
  const canVersion = useCanCall('adminAssetVersionCreate');
  const canDelete = useCanCall('adminAssetDelete');
  const a = q.data;
  return (
    <section>
      <PageHeader title={`${t('nav.assets')} · ${a?.key ?? id}`}>
        <Link className="adm-btn adm-btn--ghost" to={to('assets')}>
          {t('common.back')}
        </Link>
        {canProcess && (
          <button type="button" className="adm-btn" disabled={process.isPending} onClick={() => process.mutate({ params: { id }, body: {} })}>
            {t('assets.reprocess')}
          </button>
        )}
        {canDelete && a && <DeleteAsset asset={a} />}
      </PageHeader>
      <ErrorBox error={q.error ?? process.error} />
      {a && (
        <div className="adm-grid">
          <div className="adm-card">
            <h2>{t('assets.report')}</h2>
            <KeyValue
              items={[
                [t('fields.status'), <StatusBadge key="s" status={a.status} />],
                [t('assets.sizeBefore'), fmtSize(a.sizeBefore, lang)],
                [t('assets.sizeAfter'), fmtSize(a.sizeAfter, lang)],
                [t('assets.saved'), a.sizeAfter !== undefined && a.sizeBefore ? fmtNum(1 - a.sizeAfter / a.sizeBefore, lang, { style: 'percent', maximumFractionDigits: 1 }) : '—'],
                [t('assets.triangles'), fmtNum(a.triangles, lang)],
              ]}
            />
            {a.thumbUrl && <img src={a.thumbUrl} alt={t('assets.thumbAlt', { key: a.key })} className="adm-thumb" />}
          </div>
          <div className="adm-card">
            <h2>{t('assets.meta')}</h2>
            <KeyValue
              items={[
                [t('fields.filename'), a.filename ?? '—'],
                [t('assets.kind'), a.kind ? t(`assets.kinds.${a.kind}`) : '—'],
                [t('assets.contentType'), a.contentType ? <code key="ct">{a.contentType}</code> : '—'],
                [t('fields.license'), a.license ?? '—'],
                [t('fields.author'), a.author ?? '—'],
                [t('fields.source'), a.source ?? '—'],
                [t('assets.version'), a.version ?? '—'],
                [t('fields.createdAt'), fmtDate(a.createdAt, lang)],
                [t('assets.createdBy'), a.createdBy ? <code key="cb" title={a.createdBy}>{a.createdBy.slice(0, 8)}</code> : '—'],
                [t('assets.completedAt'), a.completedAt ? fmtDate(a.completedAt, lang) : t('assets.notCompleted')],
              ]}
            />
          </div>
          <div className="adm-card">
            <h2>{t('assets.violations')}</h2>
            {a.violations.length ? (
              <ul className="adm-plain">
                {a.violations.map((v) => (
                  <li key={v} className="adm-alert adm-alert--error">
                    {v}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-muted">{t('assets.noViolations')}</p>
            )}
          </div>
          <div className="adm-card">
            <h2>{t('assets.nodes')}</h2>
            {a.nodes.length ? <Tree node={nodeTree(a.nodes)} /> : <p className="adm-muted">{t('assets.noNodes')}</p>}
          </div>
        </div>
      )}
      {a && <Versions id={id} />}
      {a && canVersion && (
        <NewVersion
          asset={a}
          onDone={() => {
            void qc.invalidateQueries({ queryKey: ['adminAssetGet'] });
            void qc.invalidateQueries({ queryKey: ['adminAssetVersions'] });
            void qc.invalidateQueries({ queryKey: ['adminAssetList'] });
          }}
        />
      )}
      <p className="adm-hint">{t('assets.stubNote')}</p>
    </section>
  );
}
