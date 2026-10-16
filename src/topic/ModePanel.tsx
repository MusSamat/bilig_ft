/**
 * «Вид модели» glass card (W-23), overlaid top-right on the stage: built from
 * plugin.modes() ∩ scene.modes plus the universal modes. Grouped modes are
 * exclusive icon tiles (radio group), the rest are switches. Labels come
 * from locale keys `mode.<id>` (content label as fallback).
 */
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { isModeActive, modeGroups } from '@bilig/scene-core';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';

/** Same meaning → same icon as the Workbench prototype. */
const MODE_ICONS: Record<string, string> = {
  whole: 'cube',
  section: 'cut',
  'ball-stick': 'ball',
  spacefill: 'fill',
  solid: 'solid',
  wireframe: 'cube',
  shells: 'atom',
  labels: 'tag',
  rotate: 'reset',
  vectors: 'arrow',
  trace: 'activity',
  energy: 'bolt',
  schematic: 'columns',
  electrons: 'zap',
  orbits: 'orbit',
  'earth-view': 'globe',
  'sun-rays': 'sun',
  'true-scale': 'ruler',
};
const modeIcon = (id: string) => MODE_ICONS[id] ?? 'layers';

export function ModePanel({ ready }: { ready: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const defs = useViewer((s) => s.modeDefs);
  const modes = useViewer((s) => s.modes);
  const toggle = useViewer((s) => s.toggleMode);
  if (!ready || !defs.length) return null;
  const label = (id: string, fallback: Parameters<typeof tr>[0]) => t(`mode.${id}`, { defaultValue: tr(fallback, lang) });
  const groups = modeGroups(defs);
  // Universal switches (labels, rotation) go last, as in the prototype.
  const toggles = defs.filter((d) => !d.group).sort((a, b) => Number(['labels', 'rotate'].includes(a.id)) - Number(['labels', 'rotate'].includes(b.id)));
  return (
    <section className="view glass" aria-labelledby="view-title">
      <h3 id="view-title">
        <Icon name="layers" className="sm" />
        {t('mode.panel')}
      </h3>
      {groups.map((g) => {
        const items = defs.filter((d) => d.group === g);
        return (
          <div key={g} className="vseg" role="radiogroup" aria-labelledby="view-title" style={{ gridTemplateColumns: `repeat(${Math.min(3, items.length)}, minmax(0, 1fr))` }}>
            {items.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={isModeActive(modes, d)} onClick={() => toggle(d.id)}>
                <Icon name={modeIcon(d.id)} className="lg" />
                {label(d.id, d.label)}
              </button>
            ))}
          </div>
        );
      })}
      {toggles.map((d) => (
        <button key={d.id} type="button" className="sw" role="switch" aria-checked={isModeActive(modes, d)} onClick={() => toggle(d.id)}>
          <Icon name={modeIcon(d.id)} className="sm" />
          {label(d.id, d.label)}
          <i aria-hidden="true" />
        </button>
      ))}
    </section>
  );
}
