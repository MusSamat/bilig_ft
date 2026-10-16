/**
 * Entity pages built on the generic resource layer:
 *  A-02 subjects / groups, A-03 courses / units / objectives,
 *  A-04 concepts (usage, no delete while used), A-08 processes (step player),
 *  A-10 items (5 types, answer stats), A-12 glossary.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t as tl, type Process } from '@bilig/content-model';
import { useApiQuery } from '../api/hooks';
import { useAdminLang, useT } from '../i18n';
import { usePreviewBridge } from '../lib/preview-bridge';
import { useAdminPath } from '../shell/base';
import { ErrorBox, KeyValue, fmtNum } from '../shell/ui';
import { ResourceEdit, ResourceList } from './ResourcePages';
import { RESOURCES, type AdminRec } from './resources';
import { Icon } from '../lib/icons';

export const SubjectsList = () => {
  const t = useT();
  const to = useAdminPath();
  return (
    <ResourceList
      def={RESOURCES.subjects}
      toolbar={
        <Link className="adm-btn adm-btn--ghost" to={to('groups')}>
          {t('nav.groups')}
        </Link>
      }
    />
  );
};
export const SubjectEdit = () => <ResourceEdit def={RESOURCES.subjects} />;
export const GroupsList = () => <ResourceList def={RESOURCES.groups} />;
export const GroupEdit = () => <ResourceEdit def={RESOURCES.groups} />;
export const CoursesList = () => <ResourceList def={RESOURCES.courses} />;
export const CourseEdit = () => <ResourceEdit def={RESOURCES.courses} />;
export const UnitsList = () => <ResourceList def={RESOURCES.units} />;
export const UnitEdit = () => <ResourceEdit def={RESOURCES.units} />;
export const ObjectivesList = () => <ResourceList def={RESOURCES.objectives} />;
export const ObjectiveEdit = () => <ResourceEdit def={RESOURCES.objectives} />;
export const GlossaryList = () => <ResourceList def={RESOURCES.glossary} />;
export const GlossaryEdit = () => <ResourceEdit def={RESOURCES.glossary} />;
export const ConceptsList = () => <ResourceList def={RESOURCES.concepts} />;
export const ProcessesList = () => <ResourceList def={RESOURCES.processes} />;
export const ItemsList = () => <ResourceList def={RESOURCES.items} />;

// --- A-04 concept usage -------------------------------------------------------------

function ConceptUsage({ conceptKey }: { conceptKey: string }) {
  const t = useT();
  const q = useApiQuery('adminConceptUsage', { params: { key: conceptKey } });
  return (
    <div className="adm-card">
      <h2>{t('concepts.usage')}</h2>
      <ErrorBox error={q.error} />
      {q.data && (q.data.topicKeys.length ? (
        <ul className="adm-plain">
          {q.data.topicKeys.map((k) => (
            <li key={k}>
              <code>{k}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-muted">{t('concepts.unused')}</p>
      ))}
      <p className="adm-hint">{t('concepts.usageNote')}</p>
    </div>
  );
}

export function ConceptEdit() {
  const t = useT();
  const [usage, setUsage] = useState<Record<string, number>>({});
  return (
    <ResourceEdit
      def={RESOURCES.concepts}
      side={(key) => (
        <>
          <ConceptUsage conceptKey={key} />
          <UsageProbe conceptKey={key} onCount={(n) => setUsage((u) => (u[key] === n ? u : { ...u, [key]: n }))} />
        </>
      )}
      deleteBlocked={(key) => (usage[key] ? t('concepts.deleteBlocked', { count: usage[key] }) : null)}
    />
  );
}

function UsageProbe({ conceptKey, onCount }: { conceptKey: string; onCount(n: number): void }) {
  const q = useApiQuery('adminConceptUsage', { params: { key: conceptKey } });
  const n = q.data?.topicKeys.length;
  useEffect(() => {
    if (n !== undefined) onCount(n);
  }, [n, onCount]);
  return null;
}

// --- A-08 process player --------------------------------------------------------------

export function ProcessPlayer({ process }: { process: Process }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const play3d = usePreviewBridge((s) => s.bridge.playProcess);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const steps = process.steps ?? [];
  useEffect(() => {
    if (!playing) return;
    const ms = (steps[step]?.duration ?? 1) * 1000;
    const id = setTimeout(() => {
      if (step + 1 >= steps.length) setPlaying(false);
      else setStep(step + 1);
    }, ms);
    return () => clearTimeout(id);
  }, [playing, step, steps]);
  const cur = steps[Math.min(step, steps.length - 1)];
  return (
    <div className="adm-card adm-player">
      <h2>{t('processes.preview')}</h2>
      {process.equation && <p className="adm-mono">{process.equation}</p>}
      <KeyValue items={[[t('fields.inputs'), tl(process.inputs, lang)], [t('fields.outputs'), tl(process.outputs, lang)], ...(process.energy ? ([[t('fields.energy'), tl(process.energy, lang)]] as [string, string][]) : [])]} />
      {cur && (
        <div className="adm-player__step" aria-live="polite">
          <strong>
            {step + 1}/{steps.length} · {tl(cur.title, lang)}
          </strong>
          <p>{tl(cur.description, lang)}</p>
          {cur.result && (
            <p className="adm-muted adm-inline">
              <Icon id="arrow" size={16} />
              {tl(cur.result, lang)}
            </p>
          )}
          {cur.conceptKey && <code>{cur.conceptKey}</code>}
        </div>
      )}
      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn--small" disabled={step === 0} aria-label={t('list.prev')} onClick={() => setStep(step - 1)}>
          <Icon id="prev" size={18} />
        </button>
        <button type="button" className="adm-btn adm-btn--small" onClick={() => { if (step + 1 >= steps.length) setStep(0); setPlaying(!playing); }}>
          <Icon id={playing ? 'pause' : 'play'} size={16} />
          {playing ? t('processes.pause') : t('processes.play')}
        </button>
        <button type="button" className="adm-btn adm-btn--small" disabled={step >= steps.length - 1} aria-label={t('list.next')} onClick={() => setStep(step + 1)}>
          <Icon id="next" size={18} />
        </button>
        <button type="button" className="adm-btn adm-btn--small" disabled={!play3d} title={play3d ? undefined : t('preview.needsViewer')} onClick={() => play3d?.(process.key, step)}>
          {t('processes.play3d')}
        </button>
      </div>
      {process.metrics?.length > 0 && (
        <div className="adm-tablewrap">
        <table className="adm-table adm-table--compact">
          <caption>{t('fields.metrics')}</caption>
          <tbody>
            {process.metrics.map((m) => (
              <tr key={m.key}>
                <td>{tl(m.label, lang)}</td>
                <td>{m.unit ?? ''}</td>
                <td className="adm-muted">{m.min !== undefined || m.max !== undefined ? `${m.min ?? '…'} – ${m.max ?? '…'}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <p className="adm-hint">{t('processes.metricsNote')}</p>
    </div>
  );
}

export const ProcessEdit = () => <ResourceEdit def={RESOURCES.processes} side={(_k, rec) => (rec ? <ProcessPlayer process={(rec as AdminRec<Process>).data} /> : null)} />;

// --- A-10 item stats -------------------------------------------------------------------

function ItemStats({ itemKey }: { itemKey: string }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const q = useApiQuery('adminItemStats', { params: { key: itemKey } });
  return (
    <div className="adm-card">
      <h2>{t('items.stats')}</h2>
      <ErrorBox error={q.error} />
      {q.data && (
        <KeyValue
          items={[
            [t('items.answers'), fmtNum(q.data.answers, lang)],
            [t('items.correctRate'), q.data.correctRate === null ? '—' : fmtNum(q.data.correctRate, lang, { style: 'percent', maximumFractionDigits: 1 })],
            [t('items.commonWrong'), q.data.commonWrong ? <code>{q.data.commonWrong}</code> : '—'],
            [t('items.avgTime'), q.data.avgTimeMs === null ? '—' : `${fmtNum(q.data.avgTimeMs / 1000, lang, { maximumFractionDigits: 1 })} s`],
          ]}
        />
      )}
    </div>
  );
}

export const ItemEdit = () => <ResourceEdit def={RESOURCES.items} side={(key) => (key ? <ItemStats itemKey={key} /> : null)} />;
