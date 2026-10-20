/**
 * Topic hero (W-10/W-11/W-12), compact so the 3D stage starts on the first
 * screen (audit P-1): one glass panel with
 *  1. the crumbs (one line) and the topic toolbar (lesson / explore, language, presentation);
 *  2. the serif title with the formula and classification, the specimen
 *     switcher and the «N of M explored» progress;
 *  3. the lesson goal as a one-line summary that unfolds (remembered per
 *     device) into the description, the programme codes, the duration and the
 *     textbook places.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr, type Catalog } from '@bilig/content-model';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Disclosure } from '../components/Disclosure';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useTopic } from './context';
import { SampleStrip } from './SampleStrip';
import { TextbookPlaces } from './TextbookPlaces';
import { TopicToolbar } from './TopicToolbar';

export const ABOUT_KEY = 'bilig.topic.about';

/** «Изучено N из M» as a small meter (the old status tile). */
function Progress(): JSX.Element {
  const { t } = useTranslation();
  const { progress } = useTopic();
  const { learned, total, fraction } = progress.summary;
  return (
    <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-muted max-sm:hidden" title={t(progress.source === 'server' ? 'topic.progressSaved.server' : 'topic.progressSaved.local')}>
      <span aria-hidden="true">{t('topic.nOfM', { n: learned, m: total })}</span>
      <span
        className="relative block h-1.5 w-16 overflow-hidden rounded-pill bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={learned}
        aria-label={t('topic.learned', { n: learned, m: total })}
      >
        <i className="absolute inset-y-0 left-0 block rounded-pill bg-accent" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </span>
    </span>
  );
}

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
  // `--hero-h`: the stage takes the rest of the first screen under the hero.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--hero-h', `${Math.round(el.offsetHeight)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--hero-h');
    };
  }, []);
  return (
    <section ref={ref} className="topic-hero panel glass grid min-w-0 gap-2 px-4 py-3 md:px-6 md:py-4" aria-labelledby="topic-title">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <Breadcrumbs catalog={catalog} topicKey={topic.key} fallback={fallback} icon={pkg.subject.icon} />
        <TopicToolbar topicKey={topic.key} />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 id="topic-title" className="m-0 font-serif text-[clamp(26px,2.6vw,38px)] font-bold leading-tight [hyphens:manual] [overflow-wrap:normal]">
            {tr(topic.title, lang)}
            {topic.formula && (
              <>
                {', '}
                <Formula tex={topic.formula} className="formula font-serif" />
              </>
            )}
          </h1>
          {topic.classification && <p className="m-0 font-serif text-md italic text-muted">{tr(topic.classification, lang)}</p>}
        </div>
        <SampleStrip />
      </div>

      <Disclosure
        rememberKey={ABOUT_KEY}
        open={false}
        className="rounded-md bg-soft px-3"
        summary={
          <>
            <Icon name="target" className="sm shrink-0 text-accent" />
            <span className="my-2 line-clamp-1 min-w-0 flex-1 text-base font-normal group-open/disc:line-clamp-none">
              <b id="goal-title" className="me-2 font-semibold text-accent">
                {t('topic.goal')}:
              </b>
              {tr(topic.goal, lang)}
            </span>
            <Progress />
          </>
        }
      >
        <div className="grid gap-2 pb-3 ps-7">
          <p className="m-0 max-w-[75ch] text-base">{tr(topic.description, lang)}</p>
          {(objectives.length > 0 || topic.durationMin) && (
            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {objectives.length > 0 && (
                <span aria-label={t('topic.objectives')} className="flex flex-wrap gap-2">
                  {objectives.map((o) => (
                    <abbr key={o.key} title={tr(o.text, lang)} className="cursor-help font-mono font-semibold no-underline">
                      {o.code}
                    </abbr>
                  ))}
                </span>
              )}
              {topic.durationMin ? (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="clock" className="sm" />
                  {t('common.minutes', { count: topic.durationMin })}
                </span>
              ) : null}
            </p>
          )}
          <TextbookPlaces catalog={catalog} topicKey={topic.key} />
        </div>
      </Disclosure>
    </section>
  );
}
