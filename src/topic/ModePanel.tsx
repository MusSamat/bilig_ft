/**
 * «Вид модели» panel (W-23): built from plugin.modes() ∩ scene.modes plus the
 * universal modes; grouped modes are exclusive segments, the rest toggles.
 * Labels come from locale keys `mode.<id>` (content label as fallback).
 */
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { isModeActive, modeGroups } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';

export function ModePanel({ ready }: { ready: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const defs = useViewer((s) => s.modeDefs);
  const modes = useViewer((s) => s.modes);
  const toggle = useViewer((s) => s.toggleMode);
  if (!ready) return null;
  const label = (id: string, fallback: Parameters<typeof tr>[0]) => t(`mode.${id}`, { defaultValue: tr(fallback, lang) });
  const groups = modeGroups(defs);
  const toggles = defs.filter((d) => !d.group);
  return (
    <div className="mode-panel" role="group" aria-label={t('mode.panel')}>
      <span className="mode-panel__title">{t('mode.panel')}</span>
      {groups.map((g) => (
        <div key={g} className="segmented" role="radiogroup" aria-label={t('mode.panel')}>
          {defs
            .filter((d) => d.group === g)
            .map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={isModeActive(modes, d)} onClick={() => toggle(d.id)}>
                {label(d.id, d.label)}
              </button>
            ))}
        </div>
      ))}
      {toggles.map((d) => (
        <button key={d.id} type="button" className="chip" aria-pressed={isModeActive(modes, d)} onClick={() => toggle(d.id)}>
          {label(d.id, d.label)}
        </button>
      ))}
    </div>
  );
}
