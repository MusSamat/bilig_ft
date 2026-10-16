/**
 * Topic hero (W-10/W-11/W-12) — one glass panel: crumbs, serif title with the
 * formula, italic classification, description and the lesson goal (program
 * codes and duration as quiet meta) on the left; the 2×2 status tiles on the
 * right; the specimen strip across the bottom.
 */
import { useTranslation } from 'react-i18next';
import { t as tr, type Catalog } from '@bilig/content-model';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useTopic } from './context';
import { SampleStrip } from './SampleStrip';
import { StatusTiles } from './StatusTiles';

export function TopicHero({ catalog }: { catalog: Catalog | undefined }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const { topic } = pkg;
  const objectives = (pkg.objectives ?? []).filter((o) => topic.objectiveKeys.includes(o.key));
  const fallback = [
    { kind: 'subject' as const, key: pkg.subject.key, title: pkg.subject.title },
    ...(pkg.course ? [{ kind: 'course' as const, key: pkg.course.key, title: pkg.course.title }] : []),
    ...(pkg.unit ? [{ kind: 'unit' as const, key: pkg.unit.key, title: pkg.unit.title }] : []),
    { kind: 'topic' as const, key: pkg.topic.key, title: pkg.topic.title },
  ];
  return (
    <section className="hero panel glass" aria-labelledby="topic-title">
      <div className="hero__main">
        <Breadcrumbs catalog={catalog} topicKey={topic.key} fallback={fallback} icon={pkg.subject.icon} />
        <h1 id="topic-title">
          {tr(topic.title, lang)}
          {topic.formula && (
            <>
              {', '}
              <Formula tex={topic.formula} className="formula" />
            </>
          )}
        </h1>
        {topic.classification && <p className="kind">{tr(topic.classification, lang)}</p>}
        <p className="desc">{tr(topic.description, lang)}</p>
        <section className="goal" aria-labelledby="goal-title">
          <Icon name="target" />
          <div>
            <b id="goal-title">{t('topic.goal')}</b>
            <p>{tr(topic.goal, lang)}</p>
            {(objectives.length > 0 || topic.durationMin) && (
              <p className="goal__meta">
                {objectives.length > 0 && (
                  <span aria-label={t('topic.objectives')}>
                    {objectives.map((o) => (
                      <abbr key={o.key} title={tr(o.text, lang)}>
                        {o.code}
                      </abbr>
                    ))}
                  </span>
                )}
                {topic.durationMin ? (
                  <span>
                    <Icon name="clock" className="sm" />
                    {t('common.minutes', { count: topic.durationMin })}
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </section>
      </div>
      <StatusTiles />
      <SampleStrip />
    </section>
  );
}
