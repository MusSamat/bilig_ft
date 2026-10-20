/**
 * Pick the Bilig topic of a КТП lesson inside the lesson sheet: the subject's
 * topics first, then a search over the catalog (local, offline) plus the
 * server search. Escape closes it; picking returns the key (null = remove).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { useCatalog, useServerSearch } from '../api/content';
import { Icon } from '../components/Icon';
import { btn, cx, inputCls } from '../cabinet/teacher/ui';
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
    const topics = (catalog?.topics ?? []).map((tp) => ({ key: tp.key, title: tr(tp.title, lang), subjectKey: tp.subjectKey }));
    const needle = q.trim().toLocaleLowerCase(lang);
    if (!needle) return topics.filter((tp) => !subjectKey || tp.subjectKey === subjectKey).slice(0, 8);
    const local = topics.filter((tp) => tp.title.toLocaleLowerCase(lang).includes(needle));
    const seen = new Set(local.map((x) => x.key));
    const remote = (server.data?.items ?? []).filter((h) => h.kind === 'topic' && !seen.has(h.key)).map((h) => ({ key: h.key, title: h.title, subjectKey: h.subjectKey }));
    return [...local, ...remote].slice(0, 8);
  }, [catalog, q, lang, subjectKey, server.data]);

  return (
    <div
      className="grid gap-3 rounded-lg border border-accent bg-chip p-3"
      role="group"
      aria-labelledby={`${id}-h`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p id={`${id}-h`} className="m-0 text-base font-semibold text-ink">
        {t('ktp.topic.pickFor', { title: lessonTitle || '…' })}
      </p>
      <label className="relative block">
        <span className="visually-hidden">{t('ktp.topic.search')}</span>
        <Icon name="search" className="sm pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input ref={input} type="search" className={cx(inputCls, 'ps-9')} value={q} placeholder={t('ktp.topic.searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!q.trim() && subjectKey && <p className="m-0 text-sm text-muted">{t('ktp.topic.suggested')}</p>}
      <ul className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0" aria-label={t('ktp.topic.results')}>
        {options.map((o) => (
          <li key={o.key}>
            <button
              type="button"
              className={cx(
                'flex min-h-11 w-full items-center gap-2 rounded-md border-0 px-3 text-start text-base transition-colors hover:bg-soft',
                o.key === current ? 'bg-soft font-semibold text-accent' : 'bg-transparent text-ink',
              )}
              aria-current={o.key === current ? 'true' : undefined}
              onClick={() => onPick(o.key)}
            >
              <Icon name="cube" className="sm flex-none text-muted" />
              {o.title}
            </button>
          </li>
        ))}
      </ul>
      {options.length === 0 && <p className="m-0 text-base text-muted">{t('ktp.topic.noResults')}</p>}
      <div className="flex flex-wrap gap-2">
        {current && (
          <button type="button" className={btn('secondary')} onClick={() => onPick(null)}>
            <Icon name="x" className="sm" />
            {t('ktp.topic.clear')}
          </button>
        )}
        <button type="button" className={btn('ghost')} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
