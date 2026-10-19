/**
 * A student's assignments (W-54, scenario «Ученик» 2): topic, activities, due
 * date (Intl in the UI language) with overdue / due-soon badges, status and
 * score, and a link to the topic with `?assignment=<id>` so the quiz result is
 * attached to the assignment (opened in exploration, `view=study`, where the quiz is).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { useCatalog } from '../api/content';
import { fetchMyAssignments, type MyAssignment } from '../api/extensions';
import { useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { STUDY_VIEW, VIEW_PARAM } from '../lib/view';
import { formatDate, formatPercent } from './format';

const DAY = 86_400_000;

export function dueState(a: Pick<MyAssignment, 'dueAt' | 'status'>, now = Date.now()): 'overdue' | 'soon' | null {
  if (!a.dueAt || a.status === 'done') return null;
  const left = Date.parse(a.dueAt) - now;
  if (left < 0) return 'overdue';
  return left < 2 * DAY ? 'soon' : null;
}

export const useMyAssignments = () => {
  const authed = useSession((s) => s.status === 'authed' || s.status === 'offline');
  return useQuery({ queryKey: ['my-assignments'], queryFn: fetchMyAssignments, enabled: authed, staleTime: 60_000 });
};

export function StudentAssignments(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const { data, isLoading, isError, refetch } = useMyAssignments();

  return (
    <section className="card stack" aria-labelledby="my-assignments-title">
      <div className="home-section-h">
        <Icon name="cal" className="lg" />
        <h2 id="my-assignments-title">{t('cabinet.assignments')}</h2>
      </div>
      {isLoading && (
        <div className="stack" aria-busy="true" aria-label={t('common.loading')}>
          <span className="skel" style={{ height: 88, borderRadius: 'var(--r-lg)' }} />
          <span className="skel" style={{ height: 88, borderRadius: 'var(--r-lg)' }} />
        </div>
      )}
      {isError && (
        <div className="state state--error" role="alert">
          <Icon name="warn" />
          <b>{t('cabinet.assignmentsError')}</b>
          <button type="button" className="btn2" onClick={() => refetch()}>
            <Icon name="reset" className="sm" />
            {t('common.retry')}
          </button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <div className="state">
          <Icon name="check" />
          <span>{t('cabinet.assignmentsEmpty')}</span>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="assignment-list">
          {data.items.map((a) => {
            const topic = catalog?.topics.find((x) => x.key === a.topicKey);
            const title = topic ? tr(topic.title, lang) : a.topicTitle ?? a.topicKey;
            const due = dueState(a);
            const href = `${topicPath(catalog, lang, a.topicKey)}?assignment=${encodeURIComponent(a.id)}&${VIEW_PARAM}=${STUDY_VIEW}`;
            return (
              <li key={a.id} className="assignment">
                <div className="assignment__head">
                  <b>{title}</b>
                  <span className="row">
                    {due === 'overdue' && <span className="badge badge--warn">{t('cabinet.overdue')}</span>}
                    {due === 'soon' && <span className="badge badge--accent">{t('cabinet.dueSoon')}</span>}
                    {a.status === 'done' ? (
                      <span className="badge badge--ok">
                        <Icon name="check" className="sm" />
                        {t('cabinet.done')}
                      </span>
                    ) : (
                      <span className="badge">{t('cabinet.todo')}</span>
                    )}
                  </span>
                </div>
                <span className="muted small">
                  {a.dueAt ? t('cabinet.due', { date: formatDate(lang, a.dueAt) }) : t('cabinet.noDue')}
                  {' · '}
                  {t('cabinet.activities')}: {a.activities.map((x) => t(`cabinet.activity.${x}`)).join(', ')}
                  {a.score !== undefined && (
                    <>
                      {' · '}
                      {t('cabinet.score', { value: formatPercent(lang, a.score) })}
                    </>
                  )}
                </span>
                <div>
                  <Link className="cta btn--sm" to={href} aria-label={t('cabinet.openTopic', { name: title })}>
                    {t('cabinet.open')}
                    <Icon name="arrow" className="sm" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
