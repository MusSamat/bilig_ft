/** Home (W-01/W-02, scenario «Ученик» 2): hero, catalog, assignments and recent topics. */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { useCatalog } from '../api/content';
import { useSession } from '../api/session';
import { RecentTopics } from '../cabinet/RecentTopics';
import { StudentAssignments } from '../cabinet/StudentAssignments';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { useUi } from '../state/ui';

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const openCatalog = useUi((s) => s.openCatalog);
  const setContext = useUi((s) => s.setContext);
  const isStudent = useSession((s) => s.me?.kind === 'student');
  const { data: catalog } = useCatalog();

  useEffect(() => setContext(null), [setContext]);

  return (
    <div className="page">
      <section className="hero">
        <h1>{t('home.heading')}</h1>
        <p>{t('home.lead')}</p>
        <button type="button" className="btn btn--primary btn--lg" onClick={openCatalog}>
          <Icon name="search" />
          {t('home.openCatalog')}
        </button>
        <span className="muted small">{t('catalog.hotkey')}</span>
      </section>
      {isStudent && <StudentAssignments />}
      <RecentTopics />
      {catalog && catalog.topics.length > 0 && (
        <section className="card stack" aria-labelledby="featured-title">
          <h2 id="featured-title" className="panel-title">
            {t('home.featured')}
          </h2>
          <div className="topic-grid">
            {catalog.topics.slice(0, 12).map((tp) => {
              const subject = catalog.subjects.find((s) => s.key === tp.subjectKey);
              return (
                <Link key={tp.key} className="topic-tile" to={topicPath(catalog, lang, tp.key)}>
                  <Thumb src={tp.thumb && /^(https?:)?\//.test(tp.thumb) ? tp.thumb : undefined} alt="" hue={subject?.hue ?? 220} icon={subject?.icon ?? 'book'} width={72} height={54} />
                  <span>
                    <b>{tr(tp.title, lang)}</b>
                    {tp.formula && <>{', '}<Formula tex={tp.formula} /></>}
                    <br />
                    <span className="muted small">{subject ? tr(subject.title, lang) : ''}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
