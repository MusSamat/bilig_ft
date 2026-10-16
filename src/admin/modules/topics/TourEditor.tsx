/**
 * A-07 tour editor: steps with camera / visibility / focus taken from the
 * preview (extension point), text, teacher note, alt text; drag-and-drop
 * reorder (plus keyboard ↑/↓). PUT /admin/tours/:topicKey writes a new draft
 * version with If-Match = topic version.
 */
import { useMemo, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TourSchema, TourStepSchema, t as tl, type Tour, type TourStep } from '@bilig/content-model';
import { useCanCall } from '../../api/hooks';
import { api } from '../../api/session';
import { SchemaForm, IssueSummary, useValidation } from '../../forms/SchemaForm';
import { defaultFor } from '../../forms/zod-utils';
import { useAdminLang, useT } from '../../i18n';
import { usePreviewBridge } from '../../lib/preview-bridge';
import { useSuggestions } from '../../lib/suggest';
import { DraftBanner, SaveBar, useVersionedEditor, type Versioned } from '../../lib/versioned';
import { useAdminPath } from '../../shell/base';
import { ErrorBox, PageHeader } from '../../shell/ui';
import { fetchTopicState, useInvalidateTopic, useTopicState } from './useTopic';
import { Icon } from '../../lib/icons';

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

const newStep = (n: number): TourStep => ({ ...(defaultFor(TourStepSchema) as TourStep), key: `step-${n}` });

export function StepList({ steps, selected, onSelect, onChange, readOnly }: { steps: TourStep[]; selected: number; onSelect(i: number): void; onChange(s: TourStep[]): void; readOnly: boolean }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drop = (e: DragEvent, i: number) => {
    e.preventDefault();
    const from = drag ?? Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from)) {
      onChange(moveItem(steps, from, i));
      onSelect(i);
    }
    setDrag(null);
    setOver(null);
  };
  return (
    <ol className="adm-steps" aria-label={t('tour.steps')}>
      {steps.map((s, i) => (
        <li
          key={`${s.key}-${i}`}
          draggable={!readOnly}
          data-testid={`step-${i}`}
          className={`${i === selected ? 'is-active' : ''}${over === i ? ' is-over' : ''}`}
          onDragStart={(e) => {
            setDrag(i);
            e.dataTransfer.setData('text/plain', String(i));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => drop(e, i)}
        >
          <span className="adm-drag" aria-hidden="true">
            <Icon id="a-drag" size={18} />
          </span>
          <button type="button" className="adm-steps__title" onClick={() => onSelect(i)}>
            {i + 1}. {tl(s.text, lang) || <code>{s.key}</code>}
          </button>
          {!readOnly && (
            <span className="adm-array__tools">
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={t('form.moveUp')} disabled={i === 0} onClick={() => { onChange(moveItem(steps, i, i - 1)); onSelect(i - 1); }}>
                <Icon id="up" size={18} />
              </button>
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={t('form.moveDown')} disabled={i === steps.length - 1} onClick={() => { onChange(moveItem(steps, i, i + 1)); onSelect(i + 1); }}>
                <Icon id="down" size={18} />
              </button>
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={t('form.remove')} onClick={() => { onChange(steps.filter((_, n) => n !== i)); onSelect(Math.max(0, i - 1)); }}>
                <Icon id="x" size={18} />
              </button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TourEditor() {
  const t = useT();
  const to = useAdminPath();
  const { id = '' } = useParams();
  const q = useTopicState(id);
  const invalidate = useInvalidateTopic();
  const canSave = useCanCall('adminTourPut');
  const suggest = useSuggestions(['concepts']);
  const bridge = usePreviewBridge((s) => s.bridge);
  const [sel, setSel] = useState(0);
  const server = useMemo<Versioned<Tour> | undefined>(() => (q.data ? { value: q.data.doc.activities.tour ?? { steps: [newStep(1)] }, version: q.data.detail.version } : undefined), [q.data]);
  const editor = useVersionedEditor<Tour>({
    draftKey: `tour:${id}`,
    server,
    save: async (tour, version) => {
      await api.call('adminTourPut', { params: { topicKey: q.data!.detail.key }, body: { tour, version }, ifMatch: version });
      invalidate(id);
      const st = await fetchTopicState(id);
      return { value: st.doc.activities.tour ?? tour, version: st.detail.version };
    },
    reload: async () => {
      const st = await fetchTopicState(id);
      return { value: st.doc.activities.tour ?? { steps: [] }, version: st.detail.version };
    },
  });
  const issues = useValidation(TourSchema, editor.value);
  if (q.isLoading) return <p>{t('common.loading')}</p>;
  if (!q.data) return <ErrorBox error={q.error} />;
  const tour = editor.value ?? { steps: [] };
  const steps = tour.steps;
  const cur = steps[Math.min(sel, steps.length - 1)];
  const setSteps = (s: TourStep[]) => editor.setValue({ steps: s });
  const setCur = (s: TourStep) => setSteps(steps.map((x, i) => (i === sel ? s : x)));
  const capture = () => {
    if (!cur) return;
    const camera = bridge.getCamera?.() ?? cur.camera;
    const visibility = bridge.getVisibility?.() ?? cur.visibility;
    const focus = bridge.getFocus?.() ?? cur.focus;
    setCur({ ...cur, ...(camera ? { camera } : {}), ...(visibility ? { visibility } : {}), ...(focus ? { focus } : {}) });
  };
  const readOnly = !canSave;
  return (
    <section>
      <PageHeader title={`${t('activities.tour')} · ${q.data.detail.key}`}>
        <Link className="adm-btn adm-btn--ghost" to={to(`topics/${id}?tab=activities`)}>
          {t('common.back')}
        </Link>
      </PageHeader>
      <DraftBanner editor={editor} />
      <div className="adm-split">
        <div className="adm-split__side">
          <StepList steps={steps} selected={sel} onSelect={setSel} onChange={setSteps} readOnly={readOnly} />
          {!readOnly && (
            <button type="button" className="adm-btn adm-btn--small" onClick={() => { setSteps([...steps, newStep(steps.length + 1)]); setSel(steps.length); }}>
              <Icon id="plus" size={18} />
            {t('tour.addStep')}
            </button>
          )}
        </div>
        <div className="adm-split__main">
          {cur && (
            <>
              <div className="adm-toolbar">
                <button type="button" className="adm-btn adm-btn--small" disabled={readOnly || !(bridge.getCamera || bridge.getVisibility || bridge.getFocus)} title={bridge.getCamera ? undefined : t('preview.needsViewer')} onClick={capture}>
                  {t('tour.capture')}
                </button>
              </div>
              <SchemaForm schema={TourStepSchema} value={cur} onChange={setCur} readOnly={readOnly} suggest={suggest} />
            </>
          )}
        </div>
      </div>
      {issues.length > 0 && editor.dirty && <IssueSummary issues={issues} />}
      <SaveBar editor={editor} disabled={issues.length > 0} canSave={!readOnly} />
    </section>
  );
}
