/** Recently opened topics (W-54, scenario «Ученик» 2) — stored on the device. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { db, type RecentRow } from '../lib/db';
import { useLang } from '../lib/hooks';
import { Icon } from '../components/Icon';
import { subjectSwatch } from '@bilig/scene-core';
import { useUi } from '../state/ui';

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
  const theme = useUi((s) => s.theme);
  if (!rows.length) return null;
  return (
    <section className="card" aria-labelledby="recent-title">
      <div className="home-section-h">
        <Icon name="clock" className="lg" />
        <h2 id="recent-title">{t('home.recent')}</h2>
      </div>
      <div className="topic-grid">
        {rows.map((r) => {
          const sw = subjectSwatch(r.hue, theme);
          return (
            <Link key={r.topicKey} className="topic-tile" to={`/${lang}${r.path}`}>
              <span className="th" style={{ background: sw.bg, color: sw.fg }} aria-hidden="true">
                <Icon name="cube" className="lg" />
              </span>
              <span>
                <b>{tr(r.title, lang)}</b>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
