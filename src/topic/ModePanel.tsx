/**
 * «Вид модели» (W-23): built from plugin.modes() ∩ scene.modes plus the
 * universal modes. Grouped modes are exclusive icon tiles (radio group), the
 * rest are switches. Labels come from locale keys `mode.<id>` (content label
 * as fallback). It no longer floats over the model (audit P-3): the stage
 * toolbar has a «Көрүнүш» button that opens this as a popover above the
 * toolbar; whether it is open is remembered per device.
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

export const VIEW_MENU_ID = 'view-menu';

export function ModePanel({ onClose, className = '' }: { onClose(): void; className?: string }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const defs = useViewer((s) => s.modeDefs);
  const modes = useViewer((s) => s.modes);
  const toggle = useViewer((s) => s.toggleMode);
  if (!defs.length) return null;
  const label = (id: string, fallback: Parameters<typeof tr>[0]) => t(`mode.${id}`, { defaultValue: tr(fallback, lang) });
  const groups = modeGroups(defs);
  // Universal switches (labels, rotation) go last, as in the prototype.
  const toggles = defs.filter((d) => !d.group).sort((a, b) => Number(['labels', 'rotate'].includes(a.id)) - Number(['labels', 'rotate'].includes(b.id)));
  return (
    <section id={VIEW_MENU_ID} className={`glass grid gap-2 rounded-lg p-3 ${className}`} aria-labelledby="view-title">
      <div className="flex items-center gap-2">
        <h3 id="view-title" className="m-0 flex flex-1 items-center gap-2 text-sm font-semibold text-muted">
          <Icon name="layers" className="sm text-accent" />
          {t('mode.panel')}
        </h3>
        <button type="button" className="ibtn size-11" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
          <Icon name="x" className="sm" />
        </button>
      </div>
      {groups.map((g) => {
        const items = defs.filter((d) => d.group === g);
        return (
          <div key={g} className="grid gap-2" role="radiogroup" aria-labelledby="view-title" style={{ gridTemplateColumns: `repeat(${Math.min(3, items.length)}, minmax(0, 1fr))` }}>
            {items.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={isModeActive(modes, d)}
                onClick={() => toggle(d.id)}
                className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border-[1.5px] border-line bg-chip px-1.5 py-2 text-center text-sm font-semibold text-ink transition-colors hover:border-accent aria-checked:border-accent aria-checked:bg-soft aria-checked:text-accent"
              >
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
