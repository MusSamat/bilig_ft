/**
 * Processes section (W-40…W-43), Workbench layout: header with one tab per
 * process; three cards — the process (icon, title, description, equation),
 * the simulation (play/pause, restart, 0.5×/1×/2×, seek slider, segmented
 * step bar, percent, computed metrics) and the readouts (input → output,
 * energy, current step); then the step cards (click = go to step; the current
 * step's structure glows in 3D). Numbers come from the plugin or the process
 * engine — never hand-written.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr, type Process } from '@bilig/content-model';
import { SPEEDS, conceptColor, player, readoutFraction, registry, type Readout } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

export function ProcessPanel({ ready }: { ready: boolean }): JSX.Element | null {
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
  if (!proc) return null;

  return (
    <section className="sec panel glass procs" aria-labelledby="procs-title">
      <div className="sec-h">
        <Icon name="activity" className="lg" />
        <h2 id="procs-title">{t('activities.process')}</h2>
        {processes.length > 1 && (
          <div className="tabs" role="group" aria-label={t('process.tabs')}>
            {processes.map((p) => (
              <button key={p.key} type="button" className="tab" aria-pressed={p.key === proc.key} onClick={() => openProcess(p.key, p.steps)}>
                <Icon name={p.icon} />
                {tr(p.title, lang)}
              </button>
            ))}
          </div>
        )}
      </div>
      {active?.key === proc.key ? <ProcessBody process={proc} /> : <ProcessCard process={proc} />}
    </section>
  );
}

function ProcessCard({ process }: { process: Process }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <article className="card2 pcard" aria-labelledby="process-title">
      <div className="pi">
        <Icon name={process.icon} />
      </div>
      <h3 id="process-title">{tr(process.title, lang)}</h3>
      <p>{tr(process.description, lang)}</p>
      {process.equation && (
        <div className="eq" role="group" aria-label={t('process.equation')}>
          <Icon name="sigma" />
          <Formula tex={process.equation} />
        </div>
      )}
    </article>
  );
}

function ProcessBody({ process }: { process: Process }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const state = useViewer((s) => s.process!.state);
  const dispatch = useViewer((s) => s.playerDispatch);
  const pick = useViewer((s) => s.pick);
  const view = player.playerView(state);
  const segments = player.segments(state);
  const step = process.steps[view.stepIndex];
  const started = view.playing || view.fraction > 0;
  const readouts: Readout[] = registry.readoutsFor(pkg.topic.scene, process, view);
  const nf = (r: Readout) => {
    if (typeof r.value !== 'number') return r.value;
    const m = process.metrics.find((x) => x.key === r.key);
    const digits = m?.precision ?? 2;
    return new Intl.NumberFormat(lang, { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 1) }).format(r.value);
  };

  return (
    <>
      <div className="pgrid">
        <ProcessCard process={process} />

        <div className="card2 sim">
          <h3 className="ch">
            <Icon name="activity" />
            {t('process.sim')}
            <span className="pct" aria-live="off">
              {t('process.percent', { value: view.percent })}
            </span>
          </h3>
          <div className="ctrls">
            <button type="button" className="cta" onClick={() => dispatch({ type: 'toggle' })} aria-pressed={view.playing}>
              <Icon name={view.playing ? 'pause' : 'play'} className="sm" />
              {view.playing ? t('process.pause') : t('process.play')}
            </button>
            <button type="button" className="btn2" onClick={() => dispatch({ type: 'reset' })}>
              <Icon name="reset" className="sm" />
              {t('process.reset')}
            </button>
            <div className="seg sm flat" role="radiogroup" aria-label={t('process.speed')}>
              {SPEEDS.map((sp) => (
                <button key={sp} type="button" role="radio" aria-checked={view.speed === sp} onClick={() => dispatch({ type: 'speed', speed: sp })}>
                  {t('process.speedValue', { value: new Intl.NumberFormat(lang).format(sp) })}
                </button>
              ))}
            </div>
          </div>
          <label className="prg">
            {t('process.seek')}
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(view.fraction * 1000)}
              onChange={(e) => dispatch({ type: 'seek', fraction: Number(e.target.value) / 1000 })}
              aria-valuetext={t('process.percent', { value: view.percent })}
            />
          </label>
          <div className="segbar" aria-hidden="true">
            {segments.map((sg) => (
              <button key={sg.index} type="button" tabIndex={-1} onClick={() => dispatch({ type: 'seekStep', index: sg.index })}>
                <i style={{ width: `${sg.fill * 100}%` }} />
              </button>
            ))}
          </div>
          {readouts.length > 0 && (
            <div className="mets">
              {readouts.map((r) => (
                <div key={r.key} className="met" data-testid={`readout-${r.key}`}>
                  <small>{tr(r.label, lang)}</small>
                  <b>
                    {nf(r)}
                    {r.unit ? ` ${r.unit}` : ''}
                  </b>
                  <div className="bar" role="meter" aria-valuemin={r.min ?? 0} aria-valuemax={r.max ?? 1} aria-valuenow={typeof r.value === 'number' ? r.value : 0} aria-label={tr(r.label, lang)}>
                    <i style={{ width: `${readoutFraction(r) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card2 read">
          <h3 className="ch">
            <Icon name="gauge" />
            {t('process.readouts')}
          </h3>
          <div className="io">
            <div>
              <small>{t('process.inputs')}</small>
              {tr(process.inputs, lang)}
            </div>
            <Icon name="arrow" />
            <div>
              <small>{t('process.outputs')}</small>
              {tr(process.outputs, lang)}
            </div>
          </div>
          {process.energy && (
            <div className="erow">
              <span>
                <small>{t('process.energy')}</small>
                <Icon name="bolt" className="sm" />
              </span>
              <span>{tr(process.energy, lang)}</span>
            </div>
          )}
          {step && (
            <div className="fact" aria-live="polite">
              <Icon name="help" />
              <span>
                <b>{t('process.step', { n: view.stepIndex + 1 })}.</b> {tr(step.description, lang)}
              </span>
            </div>
          )}
        </div>
      </div>

      <h3 className="visually-hidden">{t('process.steps')}</h3>
      <ol className="steps">
        {process.steps.map((s, i) => {
          const c = s.conceptKey ? concepts.find((x) => x.key === s.conceptKey) ?? pkg.concepts.find((x) => x.key === s.conceptKey) : undefined;
          const on = started && i === view.stepIndex;
          const done = started && i < view.stepIndex;
          return (
            <li key={s.key} className={on ? 'on' : done ? 'done' : undefined}>
              <button
                type="button"
                aria-current={i === view.stepIndex ? 'step' : undefined}
                onClick={() => {
                  dispatch({ type: 'seekStep', index: i });
                  if (c) pick(c.key);
                }}
              >
                <span className="top2">
                  <span className="n">{i + 1}</span>
                  {s.result && <em>{tr(s.result, lang)}</em>}
                </span>
                <b>{tr(s.title, lang)}</b>
                <small>{tr(s.description, lang)}</small>
                {c && (
                  <span className="steps__c">
                    <i className="dot sm" style={{ background: conceptColor(c.hue) }} aria-hidden="true" />
                    <span className="visually-hidden">{t('process.structure')}: </span>
                    {tr(c.title, lang)}
                  </span>
                )}
                <span className="visually-hidden">{tr(s.altText, lang)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
