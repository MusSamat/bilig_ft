/**
 * "Вид модели" panel (TZ W-23). Built entirely from the plugin's modes +
 * universal modes — there is no `if (subject)` here; a new plugin just returns
 * different ModeDefs and this panel updates itself.
 */
import { useTranslation } from 'react-i18next';
import type { Topic } from '@bilig/content-model';
import { t as tr } from '@bilig/content-model';
import { registry } from '@bilig/scene-core';
import { useStore } from '../store';

export function ModePanel({ topic }: { topic: Topic }): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const modes = useStore((s) => s.modes);
  const setMode = useStore((s) => s.setMode);

  const defs = registry.modesFor(topic.scene);

  return (
    <div className="mode-panel">
      <span className="mode-panel__title">{t('panel.view')}</span>
      <div className="mode-panel__buttons">
        {defs.map((m) => (
          <button
            key={m.id}
            className={modes[m.id] ? 'is-active' : ''}
            onClick={() => setMode(m.id, !modes[m.id])}
          >
            {tr(m.label, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}
