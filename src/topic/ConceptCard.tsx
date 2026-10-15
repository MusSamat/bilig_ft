/**
 * Concept card (W-30/W-31). No selection → topic overview: sample properties
 * (from the topic's container concept), «В модели» chips. With a selection →
 * colour sphere, title, subtitle, description, typed properties with icons by
 * property type and Intl numbers in the UI language, fun fact, analogy,
 * related, and the «STEM in life» / «Simply put» examples. Data = dictionary
 * concept + topic overrides.
 */
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  formatPropValue,
  propertyType,
  t as tr,
  type ConceptProp,
  type Examples,
  type PropertyTypeDef,
} from '@bilig/content-model';
import { usePermission } from '../api/session';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { addConceptToDeck } from './actions';
import { askAssistant } from './assistantBus';
import { useTopic } from './context';

function PropsTable({ props, extra }: { props: ConceptProp[]; extra: readonly PropertyTypeDef[] }): JSX.Element {
  const lang = useLang();
  return (
    <table className="props">
      <tbody>
        {props.map((p, i) => {
          const def = propertyType(p.type, extra);
          return (
            <tr key={`${p.type}-${i}`}>
              <th scope="row">
                <span>
                  <Icon name={def?.icon ?? 'info'} size={18} />
                  {tr(def?.label, lang) || p.type}
                </span>
              </th>
              <td>{p.kind === 'formula' ? <Formula tex={p.value} /> : formatPropValue(p, lang, extra)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** «STEM в жизни» and «Проще говоря» — visible on the overview and on every concept. */
export function ExamplesSection({ examples, idPrefix }: { examples: Examples; idPrefix: string }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <div className="examples">
      <section aria-labelledby={`${idPrefix}-stem`}>
        <h3 id={`${idPrefix}-stem`}>
          <Icon name="cog" size={18} />
          {t('card.stemTitle')}
        </h3>
        <ul>
          {examples.stem.map((ex, i) => (
            <li key={i}>
              <b>
                {tr(ex.title, lang)}
                {ex.field && <span className="badge">{t(`card.field.${ex.field}`)}</span>}
              </b>
              <span>{tr(ex.text, lang)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby={`${idPrefix}-simple`}>
        <h3 id={`${idPrefix}-simple`}>
          <Icon name="lightbulb" size={18} />
          {t('card.simpleTitle')}
        </h3>
        <ul>
          {examples.simple.map((ex, i) => (
            <li key={i}>
              <b>{tr(ex.title, lang)}</b>
              <span>{tr(ex.text, lang)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ConceptCard(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { pkg, concepts, lesson } = useTopic();
  const selected = useViewer((s) => s.selected);
  const pick = useViewer((s) => s.pick);
  const select = useViewer((s) => s.select);
  const canAsk = usePermission('assistant.ask.online');
  const extra = pkg.propertyTypes ?? [];
  const concept = concepts.find((c) => c.key === selected);

  if (!concept) {
    const sample = concepts.find((c) => c.isContainer && c.props.length);
    return (
      <section className="card concept-card" aria-labelledby="card-title">
        <h2 id="card-title">{t('card.overview')}</h2>
        <p>{tr(pkg.topic.description, lang)}</p>
        {sample && (
          <>
            <h3 className="panel-title">{t('card.sampleProps')}</h3>
            <PropsTable props={sample.props} extra={extra} />
          </>
        )}
        <h3 className="panel-title">{t('card.inModel')}</h3>
        <div className="chips">
          {concepts.map((c) => (
            <button key={c.key} type="button" className="chip" onClick={() => pick(c.key)}>
              <span className="dot" style={{ background: `hsl(${c.hue} 70% 58%)` }} />
              {tr(c.title, lang)}
            </button>
          ))}
        </div>
        <ExamplesSection examples={pkg.topic.examples} idPrefix="topic-ex" />
      </section>
    );
  }

  const related = concept.related.map((k) => pkg.concepts.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => !!c);
  return (
    <section className="card concept-card" aria-labelledby="card-title" aria-live="polite">
      <div className="concept-card__head">
        <span className="sphere" aria-hidden="true" style={{ background: `radial-gradient(circle at 35% 30%, hsl(${concept.hue} 80% 75%), hsl(${concept.hue} 65% 45%))` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="card-title">{tr(concept.title, lang)}</h2>
          {concept.subtitle && <p className="subtitle">{tr(concept.subtitle, lang)}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={() => select(null)} aria-label={t('card.deselect')}>
          <Icon name="close" />
        </button>
      </div>
      <p>{tr(concept.description, lang)}</p>
      {concept.props.length > 0 && (
        <>
          <h3 className="panel-title">{t('card.properties')}</h3>
          <PropsTable props={concept.props} extra={extra} />
        </>
      )}
      {concept.analogy && (
        <p>
          <b>{t('card.analogy')}:</b> {tr(concept.analogy, lang)}
        </p>
      )}
      {concept.funFact && (
        <div className="fact">
          <b>{t('card.fact')}:</b> {tr(concept.funFact, lang)}
        </div>
      )}
      {concept.misconceptions.map((m) => (
        <div key={m.key} className="fact">
          <b>{t('card.misconception')}:</b> <s>{tr(m.text, lang)}</s> {tr(m.correction, lang)}
        </div>
      ))}
      <ExamplesSection examples={concept.examples} idPrefix={`ex-${concept.key}`} />
      {related.length > 0 && (
        <>
          <h3 className="panel-title">{t('card.related')}</h3>
          <div className="chips">
            {related.map((rc) => (
              <button key={rc.key} type="button" className="chip" onClick={() => pick(rc.key)}>
                <span className="dot" style={{ background: `hsl(${rc.hue} 70% 58%)` }} />
                {tr(rc.title, lang)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="card-actions">
        {canAsk && !lesson && (
          <button type="button" className="btn btn--primary" onClick={() => askAssistant(t('assistant.suggest.what', { name: tr(concept.title, lang) }))}>
            <Icon name="chat" />
            {t('card.ask')}
          </button>
        )}
        <button type="button" className="btn" onClick={() => addConceptToDeck(pkg, concept, lang, navigate)}>
          <Icon name="presentation" />
          {t('card.toPresentation')}
        </button>
      </div>
    </section>
  );
}
