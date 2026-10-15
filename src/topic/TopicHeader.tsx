/** Topic header (W-10): title with formula, italic classification, description, lesson goal with KR program codes. */
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useTopic } from './context';

export function TopicHeader(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const { topic } = pkg;
  const objectives = (pkg.objectives ?? []).filter((o) => topic.objectiveKeys.includes(o.key));
  return (
    <header className="topic-head">
      <h1>
        {tr(topic.title, lang)}
        {topic.formula && (
          <>
            {', '}
            <Formula tex={topic.formula} className="formula" />
          </>
        )}
      </h1>
      {topic.classification && <p className="classification">{tr(topic.classification, lang)}</p>}
      <p>{tr(topic.description, lang)}</p>
      <section className="goal" aria-labelledby="goal-title">
        <b id="goal-title">
          <Icon name="star" size={18} /> {t('topic.goal')}
        </b>
        <p>{tr(topic.goal, lang)}</p>
        {objectives.length > 0 && (
          <div className="goal__codes" aria-label={t('topic.objectives')}>
            {objectives.map((o) => (
              <span key={o.key} className="code" title={tr(o.text, lang)}>
                {o.code}
              </span>
            ))}
            <span className="muted small">{t('topic.duration')}: {t('common.minutes', { count: topic.durationMin })}</span>
          </div>
        )}
      </section>
    </header>
  );
}
