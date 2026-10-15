/** Recently opened topics (W-54, scenario «Ученик» 2) — stored on the device. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { db, type RecentRow } from '../lib/db';
import { useLang } from '../lib/hooks';
import { Icon } from '../components/Icon';

export function useRecentTopics(limit = 6): RecentRow[] {
  const [rows, setRows] = useState<RecentRow[]>([]);
  useEffect(() => {
    void db.recent.orderBy('openedAt').reverse().limit(limit).toArray().then(setRows).catch(() => setRows([]));
  }, [limit]);
  return rows;
}

export function RecentTopics({ limit = 6 }: { limit?: number }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const rows = useRecentTopics(limit);
  if (!rows.length) return null;
  return (
    <section className="card stack" aria-labelledby="recent-title">
      <h2 id="recent-title" className="panel-title">
        <Icon name="star" />
        {t('home.recent')}
      </h2>
      <div className="topic-grid">
        {rows.map((r) => (
          <Link key={r.topicKey} className="topic-tile" to={`/${lang}${r.path}`} style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
            <span className="dot" style={{ background: `hsl(${r.hue} 65% 55%)`, width: 16, height: 16 }} />
            <b>{tr(r.title, lang)}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}
