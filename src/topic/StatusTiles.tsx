/** Four status tiles (W-11): model, focus, process (title + %), progress «N of M» with a bar. */
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { player } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

export function StatusTiles(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts, progress } = useTopic();
  const selected = useViewer((s) => s.selected);
  const proc = useViewer((s) => s.process);
  const percent = proc ? player.percent(proc.state) : 0;
  const focus = concepts.find((c) => c.key === selected);
  const process = proc ? pkg.processes.find((p) => p.key === proc.key) : undefined;
  const sample = pkg.topic.samples.find((s) => s.key === pkg.topic.key) ?? pkg.topic.samples[0];
  const { learned, total, fraction } = progress.summary;
  return (
    <section className="tiles" aria-label={t('topic.status')}>
      <div className="tile">
        <span className="tile__label">{t('topic.tile.model')}</span>
        <span className="tile__value">{tr(sample?.title ?? pkg.topic.title, lang)}</span>
        {sample?.classification && <span className="muted small"><i>{tr(sample.classification, lang)}</i></span>}
      </div>
      <div className="tile">
        <span className="tile__label">{t('topic.tile.focus')}</span>
        <span className="tile__value">
          {focus ? (
            <>
              <span className="dot" style={{ background: `hsl(${focus.hue} 70% 58%)`, display: 'inline-block', marginInlineEnd: 6 }} />
              {tr(focus.title, lang)}
            </>
          ) : (
            <span className="muted">{t('topic.tile.noFocus')}</span>
          )}
        </span>
      </div>
      <div className="tile">
        <span className="tile__label">{t('topic.tile.process')}</span>
        <span className="tile__value">{process ? `${tr(process.title, lang)} · ${t('process.percent', { value: percent })}` : <span className="muted">{t('topic.tile.noProcess')}</span>}</span>
        {process && <div className="bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>}
      </div>
      <div className="tile">
        <span className="tile__label">{t('topic.tile.progress')}</span>
        <span className="tile__value">{t('topic.learned', { n: learned, m: total })}</span>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={learned} aria-label={t('topic.tile.progress')}>
          <span style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        <span className="muted small">{t(progress.source === 'server' ? 'topic.progressSaved.server' : 'topic.progressSaved.local')}</span>
      </div>
    </section>
  );
}
