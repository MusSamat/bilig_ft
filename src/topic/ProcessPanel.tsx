/**
 * Processes (W-40…W-43): tabs per process with icons; card with icon, title,
 * description, equation; input → output and energy; the shared player
 * (scene-core `player`): play/pause, restart, 0.5×/1×/2×, seek slider,
 * segmented step bar, percent; step cards (click = go to step; the current
 * step highlights its structure in 3D); readouts computed by the plugin or the
 * process engine — never hand-written numbers.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr, type Process } from '@bilig/content-model';
import { SPEEDS, player, readoutFraction, registry, type Readout } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

export function ProcessPanel({ ready }: { ready: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const processes = pkg.topic.activities.processKeys.map((k) => pkg.processes.find((p) => p.key === k)).filter((p): p is Process => !!p);
  const active = useViewer((s) => s.process);
  const openProcess = useViewer((s) => s.openProcess);

  useEffect(() => {
    if (ready && !active && processes[0]) openProcess(processes[0].key, processes[0].steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const proc = processes.find((p) => p.key === active?.key) ?? processes[0];
  if (!proc) return <p className="muted">{t('process.none')}</p>;

  return (
    <div className="stack">
      {processes.length > 1 && (
        <div className="segmented" role="group" aria-label={t('process.tabs')}>
          {processes.map((p) => (
            <button key={p.key} type="button" aria-pressed={p.key === proc.key} onClick={() => openProcess(p.key, p.steps)}>
              <Icon name={p.icon} size={18} />
              {tr(p.title, lang)}
            </button>
          ))}
        </div>
      )}
      <article className="process-card" aria-labelledby="process-title">
        <h3 id="process-title" className="panel-title">
          <Icon name={proc.icon} />
          {tr(proc.title, lang)}
        </h3>
        <p>{tr(proc.description, lang)}</p>
        {proc.equation && (
          <div className="equation" role="group" aria-label={t('process.equation')}>
            <Formula tex={proc.equation} />
          </div>
        )}
        <div className="io">
          <div>
            <span className="muted small">{t('process.inputs')}</span>
            <br />
            {tr(proc.inputs, lang)}
          </div>
          <Icon name="arrow-right" />
          <div>
            <span className="muted small">{t('process.outputs')}</span>
            <br />
            {tr(proc.outputs, lang)}
          </div>
        </div>
        {proc.energy && (
          <p>
            <Icon name="zap" size={18} /> <b>{t('process.energy')}:</b> {tr(proc.energy, lang)}
          </p>
        )}
      </article>
      {active?.key === proc.key && <PlayerControls process={proc} />}
    </div>
  );
}

function PlayerControls({ process }: { process: Process }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const state = useViewer((s) => s.process!.state);
  const dispatch = useViewer((s) => s.playerDispatch);
  const pick = useViewer((s) => s.pick);
  const view = player.playerView(state);
  const segments = player.segments(state);
  const step = process.steps[view.stepIndex];
  const readouts: Readout[] = registry.readoutsFor(pkg.topic.scene, process, view);
  const nf = (r: Readout) => {
    if (typeof r.value !== 'number') return r.value;
    const m = process.metrics.find((x) => x.key === r.key);
    const digits = m?.precision ?? 2;
    return new Intl.NumberFormat(lang, { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 1) }).format(r.value);
  };

  return (
    <div className="player stack">
      <div className="player__controls">
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'toggle' })} aria-pressed={view.playing}>
          <Icon name={view.playing ? 'pause' : 'play'} />
          {view.playing ? t('process.pause') : t('process.play')}
        </button>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'reset' })}>
          <Icon name="reset" />
          {t('process.reset')}
        </button>
        <div className="segmented" role="radiogroup" aria-label={t('process.speed')}>
          {SPEEDS.map((sp) => (
            <button key={sp} type="button" role="radio" aria-checked={view.speed === sp} onClick={() => dispatch({ type: 'speed', speed: sp })}>
              {t('process.speedValue', { value: new Intl.NumberFormat(lang).format(sp) })}
            </button>
          ))}
        </div>
        <b aria-live="off">{t('process.percent', { value: view.percent })}</b>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(view.fraction * 1000)}
        onChange={(e) => dispatch({ type: 'seek', fraction: Number(e.target.value) / 1000 })}
        aria-label={t('process.seek')}
        aria-valuetext={t('process.percent', { value: view.percent })}
      />
      <div className="segments" aria-hidden="true">
        {segments.map((sg) => (
          <button key={sg.index} type="button" tabIndex={-1} onClick={() => dispatch({ type: 'seekStep', index: sg.index })}>
            <span style={{ width: `${sg.fill * 100}%` }} />
          </button>
        ))}
      </div>

      {step && (
        <p aria-live="polite">
          <b>{t('process.currentStep')}:</b> {t('process.stepOf', { n: view.stepIndex + 1, total: process.steps.length, title: tr(step.title, lang) })} — {tr(step.description, lang)}
        </p>
      )}

      <h4 className="panel-title">{t('process.readouts')}</h4>
      <div className="readouts">
        {readouts.map((r) => (
          <div key={r.key} className="readout" data-testid={`readout-${r.key}`}>
            <span className="muted small">{tr(r.label, lang)}</span>
            <b>
              {nf(r)}
              {r.unit ? ` ${r.unit}` : ''}
            </b>
            <div className="bar" role="meter" aria-valuemin={r.min ?? 0} aria-valuemax={r.max ?? 1} aria-valuenow={typeof r.value === 'number' ? r.value : 0} aria-label={tr(r.label, lang)}>
              <span style={{ width: `${readoutFraction(r) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <h4 className="panel-title">{t('process.steps')}</h4>
      <ol className="steps">
        {process.steps.map((s, i) => {
          const c = s.conceptKey ? concepts.find((x) => x.key === s.conceptKey) ?? pkg.concepts.find((x) => x.key === s.conceptKey) : undefined;
          return (
            <li key={s.key}>
              <button
                type="button"
                className="step-card"
                aria-current={i === view.stepIndex ? 'step' : undefined}
                onClick={() => {
                  dispatch({ type: 'seekStep', index: i });
                  if (c) pick(c.key);
                }}
              >
                <span className="row">
                  <span className="step-card__num">{i + 1}</span>
                  {s.result && <span className="badge">{tr(s.result, lang)}</span>}
                </span>
                <b>{tr(s.title, lang)}</b>
                <span className="small">{tr(s.description, lang)}</span>
                {c && (
                  <span className="small muted">
                    <span className="dot" style={{ background: `hsl(${c.hue} 70% 58%)`, display: 'inline-block', marginInlineEnd: 6 }} />
                    {t('process.structure')}: {tr(c.title, lang)}
                  </span>
                )}
                <span className="visually-hidden">{tr(s.altText, lang)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
