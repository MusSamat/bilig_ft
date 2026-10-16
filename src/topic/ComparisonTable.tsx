/**
 * Comparison (W-44): columns are samples (thumbnails) or concepts (spheres),
 * rows are property types whose values come from the concept dictionary;
 * manual cells only where the dictionary has no such property. «Вы здесь»
 * marks the current topic/selected structure; a sample header opens its
 * topic; the table scrolls sideways on phones.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPropValue, propertyType, t as tr, type ConceptProp } from '@bilig/content-model';
import { conceptColor } from '@bilig/scene-core';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/Thumb';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { useViewer } from '../state/viewer';
import { fileUrl, useTopic } from './context';

export function ComparisonTable(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts, filesBaseUrl } = useTopic();
  const { data: catalog } = useCatalog();
  const selected = useViewer((s) => s.selected);
  const pick = useViewer((s) => s.pick);
  const cmp = pkg.topic.activities.comparison;
  if (!cmp) return null;
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
    <section className="sec panel glass cmp-sec" aria-labelledby="cmp-title">
      <div className="sec-h">
        <Icon name="columns" className="lg" />
        <h2 id="cmp-title">{t('activities.compare')}</h2>
      </div>
      <div className="tscroll" tabIndex={0} role="region" aria-label={t('compare.caption')}>
        <table className="cmp">
          <caption className="visually-hidden">{t('compare.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('compare.property')}</span>
              </th>
              {cols.map(({ col, title, hue, here, thumb, topicKey }) => {
                const head = (
                  <>
                    {col.kind === 'concept' ? (
                      <span className="orb orb--sm" aria-hidden="true" style={{ '--c': conceptColor(hue ?? pkg.subject.hue) } as CSSProperties} />
                    ) : (
                      <span className="th">
                        <Thumb src={thumb && pkg.manifest.files.some((f) => f.path === thumb && f.size > 0) ? fileUrl(filesBaseUrl, thumb) : undefined} alt="" hue={pkg.subject.hue} icon={pkg.subject.icon} width={46} height={46} />
                      </span>
                    )}
                    <span>
                      <b>{title}</b>
                      {here && (
                        <span className="pill">
                          <Icon name="pin" className="sm" />
                          {t('compare.youAreHere')}
                        </span>
                      )}
                    </span>
                  </>
                );
                return (
                  <th key={col.key} scope="col" className={here ? 'here' : undefined}>
                    {col.kind === 'concept' ? (
                      <button type="button" className="colh" onClick={() => pick(col.key)}>
                        {head}
                      </button>
                    ) : topicKey && !here ? (
                      <Link className="colh" to={topicPath(catalog, lang, topicKey)} aria-label={t('compare.openSample', { name: title })}>
                        {head}
                      </Link>
                    ) : (
                      <span className="colh">{head}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((row) => {
              const def = propertyType(row, extra);
              return (
                <tr key={row}>
                  <th scope="row">
                    <span className="cmp__row">
                      <Icon name={def?.icon ?? 'tag'} size={17} />
                      {tr(def?.label, lang) || row}
                    </span>
                  </th>
                  {cols.map(({ col, props, here }) => (
                    <td key={col.key} className={here ? 'here' : undefined}>
                      {cell(col.key, props, row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small cmp__hint">{t('compare.scrollHint')}</p>
    </section>
  );
}
