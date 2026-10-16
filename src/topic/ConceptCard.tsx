/**
 * Inspector (W-30/W-31), Workbench concept card. No selection → topic
 * overview: accent orb with the subject icon, serif title, a hint, sample
 * properties, «В модели» chips and the topic examples. With a selection →
 * an orb in the structure's colour, title, subtitle, lead, typed properties
 * with icons (Intl numbers in the UI language), fact, analogy, misconceptions,
 * the examples («Простыми словами» first, then «STEM в жизни» with S/T/E/M
 * badges), linked chips and actions. Lesson mode adds the stepper.
 */
import type { CSSProperties } from 'react';
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
import { conceptColor } from '@bilig/scene-core';
import { usePermission } from '../api/session';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { addConceptToDeck } from './actions';
import { askAssistant } from './assistantBus';
import { useTopic } from './context';
import { LessonPanel } from './LessonPanel';

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
                  <Icon name={def?.icon ?? 'tag'} size={17} />
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

const FIELD_LETTER: Record<string, string> = { s: 'S', t: 'T', e: 'E', m: 'M' };

/** «Простыми словами» first (short sentences, big type), then «STEM в жизни» with S/T/E/M badges. */
export function ExamplesSection({ examples, idPrefix }: { examples: Examples; idPrefix: string }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  if (!examples.simple.length && !examples.stem.length) return null;
  return (
    <div className="examples">
      {examples.simple.length > 0 && (
        <section className="ex ex--simple" aria-labelledby={`${idPrefix}-simple`}>
          <h3 id={`${idPrefix}-simple`} className="ins-h">
            <Icon name="bulb" className="sm" />
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
      )}
      {examples.stem.length > 0 && (
        <section className="ex ex--stem" aria-labelledby={`${idPrefix}-stem`}>
          <h3 id={`${idPrefix}-stem`} className="ins-h">
            <Icon name="spark" className="sm" />
            {t('card.stemTitle')}
          </h3>
          <ul>
            {examples.stem.map((ex, i) => (
              <li key={i}>
                {ex.field && (
                  <span className={`stem-b stem-b--${ex.field}`} title={t(`card.field.${ex.field}`)}>
                    <span aria-hidden="true">{FIELD_LETTER[ex.field]}</span>
                    <span className="visually-hidden">{t(`card.field.${ex.field}`)}</span>
                  </span>
                )}
                <div>
                  <b>{tr(ex.title, lang)}</b>
                  <span>{tr(ex.text, lang)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ConceptCard({ ready = true }: { ready?: boolean }): JSX.Element {
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
    const specimen = pkg.topic.samples.find((s) => (s.topicKey ?? pkg.topic.key) === pkg.topic.key);
    return (
      <section id="insp" className="insp panel glass" aria-labelledby="card-title" aria-live="polite">
        <div className="ih">
          <span className="orb s" aria-hidden="true">
            <Icon name={pkg.subject.icon} />
          </span>
          <div>
            <p className="eyebrow">{t('card.overview')}</p>
            <h2 id="card-title">{tr(specimen?.title ?? pkg.topic.title, lang)}</h2>
            {(specimen?.classification ?? pkg.topic.classification) && <p className="sub">{tr(specimen?.classification ?? pkg.topic.classification, lang)}</p>}
          </div>
        </div>
        <p className="lead">{t('card.emptyHint')}</p>
        <ExamplesSection examples={pkg.topic.examples} idPrefix="topic-ex" />
        {sample && (
          <>
            <h3 className="ins-h">{t('card.sampleProps')}</h3>
            <PropsTable props={sample.props} extra={extra} />
          </>
        )}
        <div className="rel">
          <span className="rel__label">
            <Icon name="cube" className="sm" />
            {t('card.inModel')}:
          </span>
          {concepts.map((c) => (
            <button key={c.key} type="button" className="chip sm" onClick={() => pick(c.key)}>
              <i className="dot sm" style={{ background: conceptColor(c.hue) }} aria-hidden="true" />
              {tr(c.title, lang)}
            </button>
          ))}
        </div>
        {lesson && <LessonPanel ready={ready} />}
      </section>
    );
  }

  const related = concept.related.map((k) => pkg.concepts.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => !!c);
  return (
    <section id="insp" className="insp panel glass" aria-labelledby="card-title" aria-live="polite">
      <div className="ih">
        <span className="orb" aria-hidden="true" style={{ '--c': conceptColor(concept.hue) } as CSSProperties} />
        <div>
          <h2 id="card-title">{tr(concept.title, lang)}</h2>
          {concept.subtitle && <p className="sub">{tr(concept.subtitle, lang)}</p>}
        </div>
        <button type="button" className="ibtn glass ih__close" onClick={() => select(null)} aria-label={t('card.deselect')} title={t('card.deselect')}>
          <Icon name="x" />
        </button>
      </div>
      <p className="lead">{tr(concept.description, lang)}</p>
      {concept.props.length > 0 && (
        <>
          <h3 className="visually-hidden">{t('card.properties')}</h3>
          <PropsTable props={concept.props} extra={extra} />
        </>
      )}
      {concept.funFact && (
        <div className="fact">
          <Icon name="spark" />
          <span>
            <b className="visually-hidden">{t('card.fact')}: </b>
            {tr(concept.funFact, lang)}
          </span>
        </div>
      )}
      {concept.analogy && (
        <div className="fact fact--plain">
          <Icon name="bulb" />
          <span>
            <b>{t('card.analogy')}:</b> {tr(concept.analogy, lang)}
          </span>
        </div>
      )}
      {concept.misconceptions.map((m) => (
        <div key={m.key} className="fact fact--warn">
          <Icon name="warn" />
          <span>
            <b>{t('card.misconception')}:</b> <s>{tr(m.text, lang)}</s> {tr(m.correction, lang)}
          </span>
        </div>
      ))}
      <ExamplesSection examples={concept.examples} idPrefix={`ex-${concept.key}`} />
      {related.length > 0 && (
        <div className="rel">
          <span className="rel__label">
            <Icon name="link" className="sm" />
            {t('card.related')}:
          </span>
          {related.map((rc) => (
            <button key={rc.key} type="button" className="chip sm" onClick={() => pick(rc.key)}>
              <i className="dot sm" style={{ background: conceptColor(rc.hue) }} aria-hidden="true" />
              {tr(rc.title, lang)}
            </button>
          ))}
        </div>
      )}
      {!lesson && (
        <div className="acts">
          {canAsk && (
            <button type="button" className="btn2" onClick={() => askAssistant(t('assistant.suggest.what', { name: tr(concept.title, lang) }))}>
              <Icon name="chat" className="sm" />
              {t('card.ask')}
            </button>
          )}
          <button type="button" className="btn2" onClick={() => addConceptToDeck(pkg, concept, lang, navigate)}>
            <Icon name="deck" className="sm" />
            {t('card.toPresentation')}
          </button>
        </div>
      )}
      {lesson && <LessonPanel ready={ready} />}
    </section>
  );
}
