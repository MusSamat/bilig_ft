/**
 * Concept card (TZ W-30/W-31). No selection → topic overview + "В модели" chips.
 * With selection → color dot, title, description, typed properties (Intl per
 * language), fun fact, related, actions. Concept data = dictionary + overrides.
 */
import { useTranslation } from 'react-i18next';
import {
  formatPropValue,
  propertyType,
  t as tr,
  type ContentPackage,
  type ResolvedConcept,
} from '@bilig/content-model';
import { useStore } from '../store';

export function ConceptCard({
  pkg,
  concepts,
}: {
  pkg: ContentPackage;
  concepts: ResolvedConcept[];
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const selectedKey = useStore((s) => s.selectedConceptKey);
  const select = useStore((s) => s.selectConcept);
  const { topic } = pkg;
  const extraTypes = pkg.propertyTypes ?? [];

  const concept = concepts.find((c) => c.key === selectedKey);

  if (!concept) {
    return (
      <aside className="card">
        <h2>
          {tr(topic.title, lang)}
          {topic.formula ? `, ${topic.formula}` : ''}
        </h2>
        {topic.classification && <p className="classification">{tr(topic.classification, lang)}</p>}
        <p>{tr(topic.description, lang)}</p>
        <h4>{t('concept.inModel')}</h4>
        <div className="chips">
          {concepts.map((c) => (
            <button key={c.key} className="chip" onClick={() => select(c.key)}>
              <span className="chip__dot" style={{ background: `hsl(${c.hue} 70% 60%)` }} />
              {tr(c.title, lang)}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="card">
      <div className="card__head">
        <span className="sphere" style={{ background: `hsl(${concept.hue} 70% 60%)` }} />
        <div>
          <h2>{tr(concept.title, lang)}</h2>
          {concept.subtitle && <p className="subtitle">{tr(concept.subtitle, lang)}</p>}
        </div>
      </div>
      <p>{tr(concept.description, lang)}</p>

      {concept.props.length > 0 && (
        <>
          <h4>{t('concept.properties')}</h4>
          <table className="props">
            <tbody>
              {concept.props.map((p) => (
                <tr key={p.type}>
                  <td className="props__label">{tr(propertyType(p.type, extraTypes)?.label, lang)}</td>
                  <td className="props__value">{formatPropValue(p, lang, extraTypes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {concept.funFact && (
        <div className="fact">
          <strong>{t('concept.fact')}:</strong> {tr(concept.funFact, lang)}
        </div>
      )}

      {concept.related.length > 0 && (
        <>
          <h4>{t('concept.related')}</h4>
          <div className="chips">
            {concept.related.map((rk) => {
              const rc = pkg.concepts.find((c) => c.key === rk);
              if (!rc) return null;
              return (
                <button key={rk} className="chip" onClick={() => select(rk)}>
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
