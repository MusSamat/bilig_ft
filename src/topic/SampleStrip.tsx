/**
 * Specimen strip (W-12): cards with a 66px preview (pre-rendered WebP, else a
 * cached live 3D render, else the hue gradient), serif name and muted
 * classification; horizontal scroll with snap. The specimen on the stage is
 * marked. v0.5.0: a sample with its own `scene` (and the default specimen)
 * puts that scene on the stage; a sample of another topic without a scene
 * opens that topic (one with a scene keeps a small link to it).
 * Compact (audit P-1): 40px previews and one line of names in the hero, so
 * the stage stays on the first screen; a single sample is not repeated here.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr, type Sample } from '@bilig/content-model';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { useLang } from '../lib/hooks';
import { useLiveThumb } from '../lib/thumbs';
import { topicPath } from '../lib/urls';
import { useViewer } from '../state/viewer';
import { fileUrl, useTopic } from './context';
import { canStage, defaultSampleKey, showStageSample } from './stageSample';

function SpecThumb({ sample, current }: { sample: Sample; current: boolean }): JSX.Element {
  const { pkg, filesBaseUrl } = useTopic();
  // A live render exists per topic: use it for this topic's specimen and for linked topics only.
  const live = useLiveThumb(current ? pkg.topic.key : sample.topicKey);
  const rendered = sample.thumb && pkg.manifest.files.some((f) => f.path === sample.thumb && f.size > 0) ? fileUrl(filesBaseUrl, sample.thumb) : undefined;
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-[linear-gradient(150deg,var(--g1),var(--g2))] [&_.thumb-fallback]:min-h-0 [&_.thumb-fallback]:bg-transparent [&_img]:size-full [&_img]:scale-115 [&_img]:object-cover">
      <Thumb key={rendered ?? live ?? 'none'} src={rendered ?? live} alt="" hue={pkg.subject.hue} icon={pkg.subject.icon} width={40} height={40} />
    </span>
  );
}

/** A specimen card: 48px tall pill, accent border when it is on the stage. */
const SPEC =
  'flex min-h-12 max-w-64 items-center gap-2 rounded-lg border-[1.5px] border-line bg-chip py-1 ps-1 pe-3 text-start text-ink no-underline transition-colors [button&]:cursor-pointer [button&:enabled]:hover:border-accent [a&]:hover:border-accent disabled:cursor-progress aria-[current=true]:border-accent aria-[current=true]:bg-soft';

export function SampleStrip(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const { data: catalog } = useCatalog();
  const onStage = useViewer((s) => s.sample);
  const ready = useViewer((s) => s.topicKey === pkg.topic.key);
  const samples = pkg.topic.samples;
  if (samples.length < 2) return null;
  const defaultKey = defaultSampleKey(pkg.topic);
  const currentKey = onStage ?? defaultKey;
  return (
    <div className="relative -m-1 flex max-w-full min-w-0 snap-x gap-2 overflow-x-auto p-1 [scrollbar-width:thin]" role="list" aria-label={t('topic.samples')}>
      {samples.map((s) => {
        const current = s.key === currentKey;
        const body = (
          <>
            <SpecThumb sample={s} current={s.key === defaultKey} />
            <span className="min-w-0 truncate font-serif text-base font-bold" title={s.classification ? tr(s.classification, lang) : undefined}>
              {tr(s.title, lang)}
            </span>
            {s.classification && <span className="visually-hidden">{tr(s.classification, lang)}</span>}
          </>
        );
        const linked = !!s.topicKey && s.topicKey !== pkg.topic.key;
        const stageable = canStage(pkg.topic, s);
        return (
          <div role="listitem" key={s.key} className="flex shrink-0 snap-start items-center">
            {stageable ? (
              <>
                <button
                  type="button"
                  className={SPEC}
                  data-sample={s.key}
                  aria-pressed={current}
                  aria-current={current ? 'true' : undefined}
                  disabled={!ready}
                  onClick={() => showStageSample(pkg.topic, s.key)}
                >
                  {body}
                  {current && <span className="visually-hidden">{t('topic.current')}</span>}
                </button>
                {linked && (
                  <Link className="-ms-2 grid size-11 place-items-center rounded-full border border-line bg-chip text-ink hover:border-accent hover:text-accent" to={topicPath(catalog, lang, s.topicKey!)} aria-label={t('topic.openSampleTopic', { title: tr(s.title, lang) })} title={t('topic.openSampleTopic', { title: tr(s.title, lang) })}>
                    <Icon name="arrow" className="sm" />
                  </Link>
                )}
              </>
            ) : !linked ? (
              <div className={SPEC}>{body}</div>
            ) : (
              <Link className={SPEC} to={topicPath(catalog, lang, s.topicKey!)}>
                {body}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
