/** Sample strip (W-12): pre-rendered thumbnails with title and classification; horizontal scroll with snap. */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { useCatalog } from '../api/content';
import { Thumb } from '../components/Thumb';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { fileUrl, useTopic } from './context';

export function SampleStrip(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, filesBaseUrl } = useTopic();
  const { data: catalog } = useCatalog();
  const samples = pkg.topic.samples;
  if (!samples.length) return null;
  return (
    <section aria-labelledby="samples-title">
      <h2 id="samples-title" className="panel-title">
        {t('topic.samples')}
      </h2>
      <div className="samples" role="list">
        {samples.map((s) => {
          const current = (s.topicKey ?? pkg.topic.key) === pkg.topic.key;
          const body = (
            <>
              <Thumb src={fileUrl(filesBaseUrl, s.thumb)} alt="" hue={pkg.subject.hue} icon={pkg.subject.icon} width={152} height={100} />
              <b>{tr(s.title, lang)}</b>
              {s.classification && <small>{tr(s.classification, lang)}</small>}
            </>
          );
          return (
            <div role="listitem" key={s.key}>
              {current || !s.topicKey ? (
                <div className="sample" aria-current={current ? 'true' : undefined}>
                  {body}
                  {current && <span className="visually-hidden">{t('topic.current')}</span>}
                </div>
              ) : (
                <Link className="sample" to={topicPath(catalog, lang, s.topicKey)}>
                  {body}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
