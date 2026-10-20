/**
 * Inspector (W-30/W-31), Workbench concept card. No selection → topic
 * overview: accent orb with the subject icon, serif title, a hint, sample
 * properties, «В модели» chips and the topic examples. With a selection →
 * an orb in the structure's colour, title, subtitle, lead, typed properties
 * with icons (Intl numbers in the UI language), fact, analogy, misconceptions,
 * the examples («Простыми словами» first, then «STEM в жизни» with S/T/E/M
 * badges), linked chips and actions. Lesson mode adds the stepper.
 *
 * v0.4.0: «Ещё примеры» under each example block fetches AI-made examples
 * (labelled, with the teacher's verdict buttons); the card's text is a
 * `data-ask` region for the selection toolbar.
 */
import type { CSSProperties } from 'react';
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
import { askAssistant } from './assistantBus';
import { useTopic } from './context';
import { loadMore, useGenerated } from './generated';
import { AiBadge, FeedbackButtons, MoreButton } from './GeneratedBits';
import type { GeneratedExample } from '@bilig/content-model/api';
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

/** One example row: an S/T/E/M badge for STEM examples, title and text. */
function ExampleRow({ title, text, field, extra }: { title: string; text: string; field?: string; extra?: JSX.Element }): JSX.Element {
  const { t } = useTranslation();
  return (
    <li>
      {field && (
        <span className={`stem-b stem-b--${field}`} title={t(`card.field.${field}`)}>
          <span aria-hidden="true">{FIELD_LETTER[field]}</span>
          <span className="visually-hidden">{t(`card.field.${field}`)}</span>
        </span>
      )}
      <div>
        <b>{title}</b>
        <span>{text}</span>
        {extra}
      </div>
    </li>
  );
}

/** AI-made examples under the authored ones, plus «Ещё примеры». */
function GeneratedExamples({ kind, conceptKey }: { kind: 'simple' | 'stem'; conceptKey?: string }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const canAsk = usePermission('assistant.ask.online');
  const bucket = useGenerated(pkg.topic.key, conceptKey, kind, lang);
  if (!canAsk) return null;
  return (
    <>
      {bucket.items.length > 0 && (
        <ul className="ex__gen" aria-label={t('gen.listLabel')}>
          {(bucket.items as GeneratedExample[]).map((ex) => (
            <ExampleRow
              key={ex.id}
              title={ex.title}
              text={ex.text}
              field={kind === 'stem' ? ex.field : undefined}
              extra={
                <span className="ex__meta">
                  <AiBadge reviewed={ex.reviewed} />
                  <FeedbackButtons id={ex.id} />
                </span>
              }
            />
          ))}
        </ul>
      )}
      <MoreButton
        label={t(kind === 'stem' ? 'gen.moreStem' : 'gen.moreSimple')}
        loading={bucket.loading}
        exhausted={bucket.exhausted}
        errorKey={bucket.errorKey}
        onClick={() => void loadMore(pkg.topic.key, conceptKey, kind, lang)}
      />
    </>
  );
}

/** «Простыми словами» first (short sentences, big type), then «STEM в жизни» with S/T/E/M badges. */
export function ExamplesSection({ examples, idPrefix, conceptKey }: { examples: Examples; idPrefix: string; conceptKey?: string }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  if (!examples.simple.length && !examples.stem.length) return null;
  const askAttrs = { 'data-ask': 'example', ...(conceptKey ? { 'data-concept': conceptKey } : {}) };
  return (
    <div className="examples">
      <section className="ex ex--simple" aria-labelledby={`${idPrefix}-simple`} {...askAttrs}>
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
        <GeneratedExamples kind="simple" conceptKey={conceptKey} />
      </section>
      <section className="ex ex--stem" aria-labelledby={`${idPrefix}-stem`} {...askAttrs}>
        <h3 id={`${idPrefix}-stem`} className="ins-h">
          <Icon name="spark" className="sm" />
          {t('card.stemTitle')}
        </h3>
        <ul>
          {examples.stem.map((ex, i) => (
            <ExampleRow key={i} title={tr(ex.title, lang)} text={tr(ex.text, lang)} field={ex.field} />
          ))}
        </ul>
        <GeneratedExamples kind="stem" conceptKey={conceptKey} />
      </section>
    </div>
  );
}

export function ConceptCard({ ready = true }: { ready?: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
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
      <section id="insp" className="insp panel glass" aria-labelledby="card-title" aria-live="polite" data-ask="topic">
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
        <div className="relrow">
          <span className="relrow__label">
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
    <section id="insp" className="insp panel glass" aria-labelledby="card-title" aria-live="polite" data-ask="concept" data-concept={concept.key}>
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
      <ExamplesSection examples={concept.examples} idPrefix={`ex-${concept.key}`} conceptKey={concept.key} />
      {related.length > 0 && (
        <div className="relrow">
          <span className="relrow__label">
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
        </div>
      )}
      {lesson && <LessonPanel ready={ready} />}
    </section>
  );
}
