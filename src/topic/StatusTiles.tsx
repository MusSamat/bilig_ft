/** Status tiles (W-11), 2×2: model, focus, process (title + %), progress «N of M» with a bar. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { player } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

function Tile({ icon, label, children, title, extra }: { icon: string; label: string; children: ReactNode; title?: string; extra?: ReactNode }): JSX.Element {
  return (
    <div className="tile" title={title}>
      <div className="tl">
        <Icon name={icon} size={18} />
        {label}
      </div>
      <div className="tv">{children}</div>
      {extra}
    </div>
  );
}

export function StatusTiles(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts, progress } = useTopic();
  const selected = useViewer((s) => s.selected);
  const proc = useViewer((s) => s.process);
  const percent = proc ? player.percent(proc.state) : 0;
  const focus = concepts.find((c) => c.key === selected);
  const process = proc ? pkg.processes.find((p) => p.key === proc.key) : undefined;
  const sample = pkg.topic.samples.find((s) => (s.topicKey ?? pkg.topic.key) === pkg.topic.key) ?? pkg.topic.samples[0];
  const { learned, total, fraction } = progress.summary;
  return (
    <section className="tiles" aria-label={t('topic.status')}>
      <Tile icon="cube" label={t('topic.tile.model')} title={sample?.classification ? tr(sample.classification, lang) : undefined}>
        {tr(sample?.title ?? pkg.topic.title, lang)}
      </Tile>
      <Tile icon="focus" label={t('topic.tile.focus')}>
        {focus ? tr(focus.title, lang) : <span className="muted">{t('topic.tile.noFocus')}</span>}
      </Tile>
      <Tile icon="activity" label={t('topic.tile.process')}>
        {process ? `${tr(process.title, lang)}, ${t('process.percent', { value: percent })}` : <span className="muted">{t('topic.tile.noProcess')}</span>}
      </Tile>
      <Tile
        icon="target"
        label={t('topic.tile.progress')}
        title={t(progress.source === 'server' ? 'topic.progressSaved.server' : 'topic.progressSaved.local')}
        extra={
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={learned} aria-label={t('topic.learned', { n: learned, m: total })}>
            <i style={{ width: `${Math.round(fraction * 100)}%` }} />
          </div>
        }
      >
        {t('topic.nOfM', { n: learned, m: total })}
      </Tile>
    </section>
  );
}
