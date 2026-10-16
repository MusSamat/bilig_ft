/**
 * A-05 3D assets: register an upload (licence, author, source are required by
 * the schema), push the file in parts to the presigned URLs (resumable: the
 * parts already sent are remembered per file), queue processing, view the
 * report (size before/after, triangles, node tree, budget violations).
 * Processing is a backend stub until bilig_worker exists.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AssetUploadRequestSchema, type AssetReport, type AssetUploadRequest } from '@bilig/content-model/api';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { SchemaForm, useValidation } from '../forms/SchemaForm';
import { useAdminLang, useT } from '../i18n';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { ErrorBox, KeyValue, PageHeader, StatusBadge, fmtNum } from '../shell/ui';
import { navIcon } from '../shell/Layout';

const MB = 1024 * 1024;
const fmtSize = (n: number | undefined, lang: string) => (n === undefined ? '—' : `${fmtNum(n / MB, lang, { maximumFractionDigits: 2 })} MB`);

interface UploadState {
  assetId: string;
  partUrls: string[];
  partSize: number;
  done: number[];
}
const fileId = (f: File) => `bilig.admin.upload.${f.name}.${f.size}.${f.lastModified}`;
const readUpload = (f: File): UploadState | null => {
  try {
    return JSON.parse(localStorage.getItem(fileId(f)) ?? 'null');
  } catch {
    return null;
  }
};
const writeUpload = (f: File, s: UploadState | null) => {
  try {
    if (s) localStorage.setItem(fileId(f), JSON.stringify(s));
    else localStorage.removeItem(fileId(f));
  } catch {
    /* ignore */
  }
};

export const kindOf = (name: string): AssetUploadRequest['kind'] => (/\.(glb|gltf)$/i.test(name) ? 'glb' : /\.mol$/i.test(name) ? 'molfile' : 'image');

function Upload() {
  const t = useT();
  const nav = useNavigate();
  const to = useAdminPath();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Partial<AssetUploadRequest>>({ license: '', author: '', source: '' });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const issues = useValidation(AssetUploadRequestSchema, meta);
  const resumable = file ? readUpload(file) : null;

  const start = async () => {
    if (!file) return;
    setError(null);
    try {
      let st = readUpload(file);
      if (!st) {
        const r = await api.call('adminAssetUpload', { body: meta as AssetUploadRequest });
        st = { assetId: r.assetId, partUrls: r.partUrls, partSize: r.partSize, done: [] };
        writeUpload(file, st);
      }
      // Local-disk storage returns no part URLs: the metadata registration is the whole upload.
      for (let i = 0; i < st.partUrls.length; i++) {
        if (st.done.includes(i)) continue;
        const blob = file.slice(i * st.partSize, (i + 1) * st.partSize);
        const res = await fetch(st.partUrls[i], { method: 'PUT', body: blob });
        if (!res.ok) throw new Error(`part ${i + 1}: HTTP ${res.status}`);
        st = { ...st, done: [...st.done, i] };
        writeUpload(file, st);
        setProgress(st.done.length / st.partUrls.length);
      }
      await api.call('adminAssetProcess', { params: { id: st.assetId }, body: {} });
      writeUpload(file, null);
      void qc.invalidateQueries({ queryKey: ['adminAssetList'] });
      nav(to(`assets/${st.assetId}`));
    } catch (e) {
      setError(e);
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
          if (f) setMeta((m) => ({ ...m, filename: f.name, size: f.size, contentType: f.type || 'model/gltf-binary', kind: kindOf(f.name) }));
        }}
      />
      <SchemaForm schema={AssetUploadRequestSchema} value={meta} onChange={setMeta} hidden={['size']} />
      {resumable && <p className="adm-alert adm-alert--info">{t('assets.resume', { done: resumable.done.length, total: resumable.partUrls.length })}</p>}
      {progress !== null && <progress max={1} value={progress} aria-label={t('assets.progress')} />}
      <ErrorBox error={error} />
      <button type="button" className="adm-btn adm-btn--primary" disabled={!file || issues.length > 0} onClick={start}>
        {resumable ? t('assets.resumeButton') : t('assets.start')}
      </button>
      <p className="adm-hint">{t('assets.stubNote')}</p>
    </div>
  );
}

export function AssetsList() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const nav = useNavigate();
  const list = useListParams([]);
  const canUpload = useCanCall('adminAssetUpload');
  const columns = useMemo<Column<AssetReport>[]>(
    () => [
      { key: 'key', header: t('fields.key'), render: (a) => <code>{a.key}</code>, sortValue: (a) => a.key },
      { key: 'status', header: t('fields.status'), render: (a) => <StatusBadge status={a.status} />, sortValue: (a) => a.status },
      { key: 'sizeBefore', header: t('assets.sizeBefore'), render: (a) => fmtSize(a.sizeBefore, lang), sortValue: (a) => a.sizeBefore },
      { key: 'sizeAfter', header: t('assets.sizeAfter'), render: (a) => fmtSize(a.sizeAfter, lang), sortValue: (a) => a.sizeAfter },
      { key: 'triangles', header: t('assets.triangles'), render: (a) => fmtNum(a.triangles, lang), sortValue: (a) => a.triangles },
      { key: 'violations', header: t('assets.violations'), render: (a) => (a.violations.length ? <StatusBadge status="failed" /> : '—'), sortValue: (a) => a.violations.length },
    ],
    [t, lang],
  );
  return (
    <section>
      <PageHeader title={t('nav.assets')} icon={navIcon('assets')} description={t('pages.assets')} />
      {canUpload && <Upload />}
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

export function AssetReportPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const to = useAdminPath();
  const { id = '' } = useParams();
  const q = useApiQuery('adminAssetGet', { params: { id } }, { refetchInterval: (query) => ((query.state.data as AssetReport | undefined)?.status === 'processing' ? 3000 : false) });
  const process = useApiMutation('adminAssetProcess', ['adminAssetGet', 'adminAssetList']);
  const canProcess = useCanCall('adminAssetProcess');
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
      <p className="adm-hint">{t('assets.stubNote')}</p>
    </section>
  );
}
