/**
 * Comparison (W-44): columns are samples (thumbnails) or concepts (spheres),
 * rows are property types whose values come from the concept dictionary;
 * manual cells only where the dictionary has no such property. «Вы здесь»
 * marks the current topic/selected structure; a sample header opens its
 * topic; the table scrolls sideways on phones.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPropValue, propertyType, t as tr, type ConceptProp } from '@bilig/content-model';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { useViewer } from '../state/viewer';
import { fileUrl, useTopic } from './context';

export function ComparisonTable(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts, filesBaseUrl } = useTopic();
  const { data: catalog } = useCatalog();
  const selected = useViewer((s) => s.selected);
  const pick = useViewer((s) => s.pick);
  const cmp = pkg.topic.activities.comparison;
  if (!cmp) return <p className="muted">{t('compare.none')}</p>;
  const extra = pkg.propertyTypes ?? [];
  const container = concepts.find((c) => c.isContainer && c.props.length);

  const cols = cmp.columns.map((col) => {
    if (col.kind === 'concept') {
      const c = concepts.find((x) => x.key === col.key) ?? pkg.concepts.find((x) => x.key === col.key);
      return { col, title: c ? tr(c.title, lang) : col.key, hue: c?.hue, props: c?.props ?? [], here: selected === col.key, thumb: undefined, topicKey: undefined as string | undefined };
    }
    const s = pkg.topic.samples.find((x) => x.key === col.key);
    const isCurrent = (s?.topicKey ?? pkg.topic.key) === pkg.topic.key;
    return {
      col,
      title: s ? tr(s.title, lang) : col.key,
      hue: undefined,
      props: isCurrent ? container?.props ?? [] : ([] as ConceptProp[]),
      here: isCurrent,
      thumb: s?.thumb,
      topicKey: s?.topicKey,
    };
  });

  const cell = (colKey: string, props: ConceptProp[], row: string) => {
    const p = props.find((x) => x.type === row);
    if (p) return p.kind === 'formula' ? <Formula tex={p.value} /> : formatPropValue(p, lang, extra);
    const manual = cmp.manual?.find((m) => m.column === colKey && m.row === row);
    return manual ? tr(manual.value, lang) : t('compare.noValue');
  };

  return (
    <div className="stack">
      <p className="muted small">{t('compare.scrollHint')}</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('compare.caption')}>
        <table className="compare">
          <caption className="visually-hidden">{t('compare.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('compare.property')}</th>
              {cols.map(({ col, title, hue, here, thumb, topicKey }) => (
                <th key={col.key} scope="col" className={here ? 'is-here' : undefined}>
                  <div className="compare__col">
                    {thumb && <Thumb src={fileUrl(filesBaseUrl, thumb)} alt="" hue={pkg.subject.hue} icon={pkg.subject.icon} width={96} height={64} />}
                    {col.kind === 'concept' ? (
                      <button type="button" className="chip" onClick={() => pick(col.key)}>
                        <span className="dot" style={{ background: `hsl(${hue ?? 220} 70% 58%)` }} />
                        {title}
                      </button>
                    ) : topicKey && !here ? (
                      <Link to={topicPath(catalog, lang, topicKey)} aria-label={t('compare.openSample', { name: title })}>
                        {title}
                      </Link>
                    ) : (
                      <b>{title}</b>
                    )}
                    {here && <span className="badge badge--accent">{t('compare.youAreHere')}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((row) => {
              const def = propertyType(row, extra);
              return (
                <tr key={row}>
                  <th scope="row">
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      <Icon name={def?.icon ?? 'info'} size={18} />
                      {tr(def?.label, lang) || row}
                    </span>
                  </th>
                  {cols.map(({ col, props, here }) => (
                    <td key={col.key} className={here ? 'is-here' : undefined}>
                      {cell(col.key, props, row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
