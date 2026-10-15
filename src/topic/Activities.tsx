/** Activities tabs (W-40…W-45): processes, comparison, quiz. Lesson mode hides the quiz (W-50). */
import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { ComparisonTable } from './ComparisonTable';
import { useTopic } from './context';
import { ProcessPanel } from './ProcessPanel';
import { Quiz } from './Quiz';

type Tab = 'process' | 'compare' | 'quiz';

export function Activities({ ready }: { ready: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  const { pkg, lesson } = useTopic();
  const a = pkg.topic.activities;
  const tabs: { id: Tab; icon: string }[] = [
    ...(a.processKeys.length ? [{ id: 'process' as const, icon: 'activity' }] : []),
    ...(a.comparison ? [{ id: 'compare' as const, icon: 'layers' }] : []),
    ...(a.quiz && !lesson ? [{ id: 'quiz' as const, icon: 'check' }] : []),
  ];
  const [tab, setTab] = useState<Tab | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!tabs.length) return null;
  const current = tabs.find((x) => x.id === tab) ?? tabs[0];

  const onKey = (e: KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const j = (n + tabs.length) % tabs.length;
    setTab(tabs[j].id);
    refs.current[j]?.focus();
  };

  return (
    <section className="card tabs" aria-label={t('activities.tabs')}>
      <div role="tablist" aria-label={t('activities.tabs')}>
        {tabs.map((x, i) => (
          <button
            key={x.id}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={x.id === current.id}
            aria-controls={`panel-${x.id}`}
            tabIndex={x.id === current.id ? 0 : -1}
            onClick={() => setTab(x.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <Icon name={x.icon} size={18} />
            {t(`activities.${x.id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="tabpanel">
        {current.id === 'process' && <ProcessPanel ready={ready} />}
        {current.id === 'compare' && <ComparisonTable />}
        {current.id === 'quiz' && <Quiz ready={ready} />}
      </div>
    </section>
  );
}
