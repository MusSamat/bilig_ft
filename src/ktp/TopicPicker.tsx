/**
 * Link a Bilig topic to a КТП lesson: search the catalog topics by title (local,
 * offline) plus the server search endpoint, or clear the link. A small popover
 * dialog: Escape closes it and focus returns to the button that opened it.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { useCatalog, useServerSearch } from '../api/content';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';

export interface TopicOption {
  key: string;
  title: string;
}

export function TopicPicker({
  lessonTitle,
  current,
  subjectKey,
  onPick,
  onClose,
}: {
  lessonTitle: string;
  current: string | null;
  subjectKey: string | null;
  onPick: (key: string | null) => void;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const id = useId();
  const { data: catalog } = useCatalog();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const server = useServerSearch(q, lang);

  const options = useMemo<TopicOption[]>(() => {
    const topics = (catalog?.topics ?? []).map((tp) => ({
      key: tp.key,
      title: tr(tp.title, lang),
      subjectKey: tp.subjectKey,
    }));
    const needle = q.trim().toLocaleLowerCase(lang);
    if (!needle) return topics.filter((tp) => !subjectKey || tp.subjectKey === subjectKey).slice(0, 12);
    const local = topics.filter((tp) => tp.title.toLocaleLowerCase(lang).includes(needle));
    const seen = new Set(local.map((x) => x.key));
    const remote = (server.data?.items ?? []).filter((h) => h.kind === 'topic' && !seen.has(h.key)).map((h) => ({ key: h.key, title: h.title, subjectKey: h.subjectKey }));
    return [...local, ...remote].slice(0, 12);
  }, [catalog, q, lang, subjectKey, server.data]);

  return (
    <div
      className="ktp-picker glass"
      role="dialog"
      aria-labelledby={`${id}-h`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p id={`${id}-h`} className="small">
        <b>{t('ktp.topic.pickFor', { title: lessonTitle || '…' })}</b>
      </p>
      <label className="search">
        <Icon name="search" className="sm" />
        <span className="visually-hidden">{t('ktp.topic.search')}</span>
        <input ref={input} type="search" value={q} placeholder={t('ktp.topic.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!q.trim() && subjectKey && <p className="muted small">{t('ktp.topic.suggested')}</p>}
      <ul className="ktp-picker__list" aria-label={t('ktp.topic.results')}>
        {options.map((o) => (
          <li key={o.key}>
            <button type="button" className="ktp-picker__opt" aria-current={o.key === current ? 'true' : undefined} onClick={() => onPick(o.key)}>
              {o.title}
            </button>
          </li>
        ))}
      </ul>
      {options.length === 0 && <p className="muted small">{t('ktp.topic.noResults')}</p>}
      <div className="row ktp-picker__foot">
        {current && (
          <button type="button" className="btn btn--sm" onClick={() => onPick(null)}>
            <Icon name="x" className="sm" />
            {t('ktp.topic.clear')}
          </button>
        )}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
