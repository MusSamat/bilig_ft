/**
 * Concept card (TZ W-30/W-31). No selection → topic overview + "В модели" chips.
 * With selection → structure detail: color dot, title, description, typed
 * properties (numbers via Intl per language, W-30), fact, related, actions.
 */
import { useTranslation } from 'react-i18next';
import type { Concept, Topic } from '@bilig/content-model';
import { t as tr } from '@bilig/content-model';
import { hueFor } from '@bilig/scene-core';
import { useStore } from '../store';

function formatValue(value: string | number, unit: string | undefined, lang: string): string {
  const v = typeof value === 'number' ? new Intl.NumberFormat(lang).format(value) : value;
  return unit ? `${v} ${unit}` : String(v);
}

export function ConceptCard({ topic }: { topic: Topic }): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const selectedId = useStore((s) => s.selectedConceptId);
  const select = useStore((s) => s.selectConcept);

  const concept: Concept | undefined = topic.concepts.find((c) => c.id === selectedId);

  if (!concept) {
    return (
      <aside className="card">
        <h2>{tr(topic.title, lang)}</h2>
        {topic.classification && (
          <p className="classification">{tr(topic.classification, lang)}</p>
        )}
        <p>{tr(topic.description, lang)}</p>
        <h4>{t('concept.inModel')}</h4>
        <div className="chips">
          {topic.concepts.map((c) => (
            <button key={c.id} className="chip" onClick={() => select(c.id)}>
              <span
                className="chip__dot"
                style={{ background: `hsl(${hueFor(c, c.container ? 200 : 150)} 70% 60%)` }}
              />
              {tr(c.title, lang)}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  const hue = hueFor(concept, concept.container ? 200 : 150, topic.scene.overrides?.[concept.id]);

  return (
    <aside className="card">
      <div className="card__head">
        <span className="sphere" style={{ background: `hsl(${hue} 70% 60%)` }} />
        <div>
          <h2>{tr(concept.title, lang)}</h2>
          {concept.subtitle && <p className="subtitle">{tr(concept.subtitle, lang)}</p>}
        </div>
      </div>
      <p>{tr(concept.description, lang)}</p>

      {concept.properties.length > 0 && (
        <>
          <h4>{t('concept.properties')}</h4>
          <table className="props">
            <tbody>
              {concept.properties.map((p) => (
                <tr key={p.type}>
                  <td className="props__label">{tr(p.label, lang)}</td>
                  <td className="props__value">{formatValue(p.value, p.unit, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {concept.fact && (
        <div className="fact">
          <strong>{t('concept.fact')}:</strong> {tr(concept.fact, lang)}
        </div>
      )}

      {concept.relatedIds.length > 0 && (
        <>
          <h4>{t('concept.related')}</h4>
          <div className="chips">
            {concept.relatedIds.map((rid) => {
              const rc = topic.concepts.find((c) => c.id === rid);
              if (!rc) return null;
              return (
                <button key={rid} className="chip" onClick={() => select(rid)}>
                  {tr(rc.title, lang)}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="card__actions">
        <button className="btn btn--accent">{t('concept.ask')}</button>
        <button className="btn btn--ghost">{t('concept.toPresentation')}</button>
      </div>
    </aside>
  );
}
