/**
 * Floating assistant (W-32): a round button bottom-right, a ~400×600 panel
 * above the page (a bottom sheet on phones) or a large ~90% dialog. The panel
 * stays mounted while minimised, so the conversation survives; the state is
 * remembered per device. It sits above the 3D focus view, so a pupil can ask
 * about the model without leaving it.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../api/session';
import { Icon } from '../components/Icon';
import { useFocusTrap } from '../lib/hooks';
import { AssistantPanel } from './AssistantPanel';
import { setChatMode, useAssistantBus, type ChatMode } from './assistantBus';

export function ChatDock(): JSX.Element | null {
  const { t } = useTranslation();
  const allowed = usePermission('assistant.ask.online');
  const mode = useAssistantBus((s) => s.mode);
  const dockRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const prev = useRef<ChatMode>(mode);

  useFocusTrap(dockRef, mode === 'expanded');

  // Opening moves focus to the question field; minimising returns it to the button.
  useEffect(() => {
    const was = prev.current;
    prev.current = mode;
    if (was === mode) return;
    if (mode === 'closed') fabRef.current?.focus();
    else if (was === 'closed') document.getElementById('assistant-input')?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Only when the key comes from inside the assistant (the 3D view has its own Esc).
      if (!dockRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      setChatMode(mode === 'expanded' ? 'panel' : 'closed');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  if (!allowed) return null;
  const expanded = mode === 'expanded';

  const controls = (
    <div className="chat-dock__ctl">
      <button
        type="button"
        className="ibtn glass"
        onClick={() => setChatMode(expanded ? 'panel' : 'expanded')}
        aria-label={expanded ? t('assistant.shrink') : t('assistant.expand')}
        title={expanded ? t('assistant.shrink') : t('assistant.expand')}
      >
        <Icon name={expanded ? 'shrink' : 'expand'} />
      </button>
      <button type="button" className="ibtn glass" onClick={() => setChatMode('closed')} aria-label={t('assistant.minimize')} title={t('assistant.minimize')}>
        <Icon name="minus" />
      </button>
    </div>
  );

  return (
    <>
      {mode === 'closed' && (
        <button ref={fabRef} type="button" className="chat-fab" onClick={() => setChatMode('panel')} aria-label={t('assistant.open')} title={t('assistant.open')}>
          <Icon name="chat" />
          <span className="chat-fab__label">{t('assistant.title')}</span>
        </button>
      )}
      {expanded && <div className="chat-backdrop" aria-hidden="true" onClick={() => setChatMode('panel')} />}
      <div
        ref={dockRef}
        className={`chat-dock glass chat-dock--${mode}`}
        hidden={mode === 'closed'}
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded || undefined}
        aria-labelledby={expanded ? 'assistant-title' : undefined}
      >
        <AssistantPanel controls={controls} />
      </div>
    </>
  );
}
