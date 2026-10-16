/**
 * Progress per topic (W-54): assigned and recently opened topics, «N of M»
 * from GET /progress/:topicKey (server for signed-in users). M is the topic's
 * concept count from the catalog summary.
 */
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { api } from '../api/client';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';

export function TopicProgressList({ topicKeys }: { topicKeys: string[] }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const keys = [...new Set(topicKeys)].slice(0, 12);
  const results = useQueries({
    queries: keys.map((k) => ({ queryKey: ['progress', k], queryFn: () => api('progressGet', { params: { topicKey: k } }), staleTime: 30_000, retry: false })),
  });
  return (
    <section className="card stack" aria-labelledby="progress-title">
      <div className="home-section-h">
        <Icon name="target" className="lg" />
        <h2 id="progress-title">{t('cabinet.progress')}</h2>
      </div>
      {keys.length === 0 && (
        <div className="state">
          <Icon name="target" />
          <span>{t('cabinet.progressEmpty')}</span>
        </div>
      )}
      <ul className="assignment-list">
        {keys.map((k, i) => {
          const summary = catalog?.topics.find((x) => x.key === k);
          const m = summary?.counts.concepts ?? 0;
          const n = Math.min(m, results[i]?.data?.visitedConcepts.length ?? 0);
          const pct = m ? Math.round((n / m) * 100) : 0;
          return (
            <li key={k} className="assignment">
              <b>{summary ? tr(summary.title, lang) : k}</b>
              <span className="muted small">{t('cabinet.learned', { n, m })}</span>
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={m} aria-valuenow={n} aria-label={summary ? tr(summary.title, lang) : k}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
