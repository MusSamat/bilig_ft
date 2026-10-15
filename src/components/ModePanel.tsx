/**
 * "Вид модели" panel (TZ W-23). Built from plugin.modes() ∩ scene.modes +
 * universal modes; groups are exclusive segments. No `if (subject)` here.
 */
import { useTranslation } from 'react-i18next';
import { t as tr, type Topic } from '@bilig/content-model';
import { isModeActive, registry, toggleMode } from '@bilig/scene-core';
import { useStore } from '../store';

export function ModePanel({ topic }: { topic: Topic }): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const modes = useStore((s) => s.modes);
  const setModes = useStore((s) => s.setModes);

  const defs = registry.modesFor(topic.scene);

  return (
    <div className="mode-panel">
      <span className="mode-panel__title">{t('panel.view')}</span>
      <div className="mode-panel__buttons">
        {defs.map((m) => (
          <button
            key={m.id}
            className={isModeActive(modes, m) ? 'is-active' : ''}
            onClick={() => setModes(toggleMode(modes, defs, m.id))}
          >
            {tr(m.label, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}
