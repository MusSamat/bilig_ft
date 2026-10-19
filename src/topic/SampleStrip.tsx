/**
 * Specimen strip (W-12): cards with a 66px preview (pre-rendered WebP, else a
 * cached live 3D render, else the hue gradient), serif name and muted
 * classification; horizontal scroll with snap. The specimen on the stage is
 * marked. v0.5.0: a sample with its own `scene` (and the default specimen)
 * puts that scene on the stage; a sample of another topic without a scene
 * opens that topic (one with a scene keeps a small link to it).
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
    <span className="th">
      <Thumb key={rendered ?? live ?? 'none'} src={rendered ?? live} alt="" hue={pkg.subject.hue} icon={pkg.subject.icon} width={66} height={66} />
    </span>
  );
}

export function SampleStrip(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const { data: catalog } = useCatalog();
  const onStage = useViewer((s) => s.sample);
  const ready = useViewer((s) => s.topicKey === pkg.topic.key);
  const samples = pkg.topic.samples;
  if (!samples.length) return null;
  const defaultKey = defaultSampleKey(pkg.topic);
  const currentKey = onStage ?? defaultKey;
  return (
    <div className="specs" role="list" aria-label={t('topic.samples')}>
      {samples.map((s) => {
        const current = s.key === currentKey;
        const body = (
          <>
            <SpecThumb sample={s} current={s.key === defaultKey} />
            <span>
              <b>{tr(s.title, lang)}</b>
              {s.classification && <small>{tr(s.classification, lang)}</small>}
            </span>
          </>
        );
        const linked = !!s.topicKey && s.topicKey !== pkg.topic.key;
        const stageable = canStage(pkg.topic, s);
        return (
          <div role="listitem" key={s.key} className="specs__item">
            {stageable ? (
              <>
                <button
                  type="button"
                  className="spec"
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
                  <Link className="spec__open" to={topicPath(catalog, lang, s.topicKey!)} aria-label={t('topic.openSampleTopic', { title: tr(s.title, lang) })} title={t('topic.openSampleTopic', { title: tr(s.title, lang) })}>
                    <Icon name="arrow" className="sm" />
                  </Link>
                )}
              </>
            ) : !linked ? (
              <div className="spec">{body}</div>
            ) : (
              <Link className="spec" to={topicPath(catalog, lang, s.topicKey!)}>
                {body}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
