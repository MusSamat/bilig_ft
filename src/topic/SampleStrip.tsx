/**
 * Specimen strip (W-12): cards with a 66px preview (pre-rendered WebP, else a
 * cached live 3D render, else the hue gradient), serif name and muted
 * classification; horizontal scroll with snap. The current specimen is marked;
 * the others open their topic.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr, type Sample } from '@bilig/content-model';
import { useCatalog } from '../api/content';
import { Thumb } from '../components/Thumb';
import { useLang } from '../lib/hooks';
import { useLiveThumb } from '../lib/thumbs';
import { topicPath } from '../lib/urls';
import { fileUrl, useTopic } from './context';

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
  const samples = pkg.topic.samples;
  if (!samples.length) return null;
  // The current specimen: the sample pointing at this topic, else the first one without a topic of its own.
  const currentKey = (samples.find((s) => s.topicKey === pkg.topic.key) ?? samples.find((s) => !s.topicKey))?.key;
  return (
    <div className="specs" role="list" aria-label={t('topic.samples')}>
      {samples.map((s) => {
        const current = s.key === currentKey;
        const body = (
          <>
            <SpecThumb sample={s} current={current} />
            <span>
              <b>{tr(s.title, lang)}</b>
              {s.classification && <small>{tr(s.classification, lang)}</small>}
            </span>
          </>
        );
        return (
          <div role="listitem" key={s.key} className="specs__item">
            {current || !s.topicKey ? (
              <div className="spec" aria-current={current ? 'true' : undefined}>
                {body}
                {current && <span className="visually-hidden">{t('topic.current')}</span>}
              </div>
            ) : (
              <Link className="spec" to={topicPath(catalog, lang, s.topicKey)}>
                {body}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
