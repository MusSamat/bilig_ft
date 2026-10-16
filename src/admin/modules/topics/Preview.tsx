/**
 * A-06 live preview: the topic draft assembled into a ContentPackage-shaped
 * object (draft doc + dictionary concepts + subject) and rendered as a
 * structured card in the chosen content language, with the contract's own
 * package validation. Extension point: when a 3D renderer is registered via
 * `setPreviewRenderer` (viewer core shared with the admin), it is shown above
 * the card with the same package.
 */
import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  LANGS,
  formatPropValue,
  t as tl,
  topicConcepts,
  validatePackage,
  type Concept,
  type ContentPackage,
  type Examples,
  type Lang,
  type Subject,
  type Topic,
} from '@bilig/content-model';
import { useApiQuery } from '../../api/hooks';
import { api } from '../../api/session';
import { useT } from '../../i18n';
import { usePreviewBridge } from '../../lib/preview-bridge';
import { Badge } from '../../shell/ui';

const ZERO_HASH = '0'.repeat(64);

/** Assemble a preview package from the draft (concepts missing from the dictionary are skipped). */
export function previewPackage(doc: Topic, concepts: Concept[], subject: Subject | undefined, version = '0.0.0'): ContentPackage {
  return {
    manifest: { topicKey: doc.key, version, hash: ZERO_HASH, files: [] },
    subject: subject ?? { key: 'preview', title: { ky: '', ru: '', en: 'preview' }, icon: 'square', hue: 210, group: 'preview', order: 0, status: 'live' },
    topic: doc,
    concepts,
    processes: [],
    items: [],
    glossary: [],
  };
}

function ExamplesBlock({ examples, lang }: { examples: Examples | undefined; lang: Lang }) {
  const t = useT();
  if (!examples) return null;
  return (
    <div className="adm-preview__examples">
      {(['stem', 'simple'] as const).map((kind) => (
        <div key={kind}>
          <h4>{t(`preview.examples.${kind}`)}</h4>
          <ul>
            {(examples[kind] ?? []).map((e, i) => (
              <li key={i}>
                {e.field && <Badge tone="info">{e.field.toUpperCase()}</Badge>} <strong>{tl(e.title, lang)}</strong> — {tl(e.text, lang)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function TopicPreview({ doc, subjectKey, version }: { doc: Topic; subjectKey?: string; version?: string }) {
  const t = useT();
  const [lang, setLang] = useState<Lang>('ky');
  const [showJson, setShowJson] = useState(false);
  const Renderer = usePreviewBridge((s) => s.renderer);
  const keys = doc.conceptKeys ?? [];
  const conceptQs = useQueries({
    queries: keys.map((k) => ({ queryKey: ['adminConceptGet', { key: k }, {}], queryFn: () => api.call('adminConceptGet', { params: { key: k } }), staleTime: 60_000, retry: false })),
  });
  const subject = useApiQuery('adminSubjectGet', { params: { key: subjectKey ?? '' } }, { enabled: !!subjectKey, staleTime: 60_000 });
  const concepts = conceptQs.map((q) => q.data?.data).filter((c): c is Concept => !!c);
  const missing = keys.filter((_, i) => conceptQs[i].isError);
  const pkg = useMemo(() => previewPackage(doc, concepts, subject.data?.data, version), [doc, concepts, subject.data, version]);
  const validation = useMemo(() => validatePackage(pkg), [pkg]);
  const resolved = useMemo(() => {
    try {
      return topicConcepts(pkg);
    } catch {
      return [];
    }
  }, [pkg]);
  const tour = doc.activities?.tour?.steps ?? [];

  return (
    <div className="adm-preview" lang={lang}>
      <div className="adm-preview__bar">
        <strong>{t('preview.title')}</strong>
        <div className="adm-lang" role="group" aria-label={t('preview.lang')}>
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'is-active' : undefined} onClick={() => setLang(l)}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" aria-pressed={showJson} onClick={() => setShowJson(!showJson)}>
          JSON
        </button>
      </div>
      {Renderer ? (
        <div className="adm-preview__viewer">
          <Renderer pkg={pkg} lang={lang} />
        </div>
      ) : (
        <p className="adm-hint" data-testid="viewer-slot">
          {t('preview.viewerSlot')}
        </p>
      )}
      {showJson ? (
        <pre className="adm-mono adm-preview__json">{JSON.stringify(pkg, null, 2)}</pre>
      ) : (
        <article className="adm-preview__card">
          <h3>
            {tl(doc.title, lang) || <span className="adm-muted">{t('preview.untitled')}</span>}
            {doc.formula && <span className="adm-muted">, {doc.formula}</span>}
          </h3>
          {doc.classification && <p>
            <em>{tl(doc.classification, lang)}</em>
          </p>}
          {doc.goal && (
            <p>
              <strong>{t('fields.goal')}:</strong> {tl(doc.goal, lang)}
            </p>
          )}
          <p>{tl(doc.description, lang)}</p>
          <p className="adm-muted">
            {t('preview.meta', { min: doc.durationMin ?? 0, plugin: doc.scene?.plugin ?? '—', concepts: keys.length })}
          </p>
          <h4>{t('fields.conceptKeys')}</h4>
          <div className="adm-preview__concepts">
            {resolved.map((c) => (
              <div key={c.key} className="adm-preview__concept" style={{ borderInlineStartColor: `hsl(${c.hue} 65% 50%)` }}>
                <strong>{tl(c.title, lang)}</strong> <code className="adm-muted">{c.key}</code>
                {c.subtitle && <div className="adm-muted">{tl(c.subtitle, lang)}</div>}
                <p>{tl(c.description, lang)}</p>
                {c.props.length > 0 && (
                  <dl className="adm-kv adm-kv--compact">
                    {c.props.map((p, i) => (
                      <div key={i}>
                        <dt>{p.type}</dt>
                        <dd>{formatPropValue(p, lang)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {c.nodes && c.nodes.length > 0 && <div className="adm-muted">{t('preview.nodes', { nodes: c.nodes.join(', ') })}</div>}
                <ExamplesBlock examples={c.examples} lang={lang} />
              </div>
            ))}
            {missing.map((k) => (
              <div key={k} className="adm-alert adm-alert--error">
                {t('preview.conceptMissing', { key: k })}
              </div>
            ))}
          </div>
          {tour.length > 0 && (
            <>
              <h4>{t('activities.tour')}</h4>
              <ol>
                {tour.map((s) => (
                  <li key={s.key}>{tl(s.text, lang)}</li>
                ))}
              </ol>
            </>
          )}
          <h4>{t('preview.topicExamples')}</h4>
          <ExamplesBlock examples={doc.examples} lang={lang} />
        </article>
      )}
      <details className="adm-preview__validation" open={!validation.ok}>
        <summary>
          {validation.ok ? <Badge tone="ok">{t('preview.valid')}</Badge> : <Badge tone="error">{t('preview.invalid')}</Badge>}{' '}
          {t('preview.issues', { count: validation.issues.length })}
        </summary>
        <ul>
          {validation.issues.slice(0, 30).map((i, n) => (
            <li key={n} className={i.severity === 'error' ? 'is-fail' : undefined}>
              <code>{i.path.join('.')}</code> {i.message}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
