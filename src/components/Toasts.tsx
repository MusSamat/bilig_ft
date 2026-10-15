/** Toast notifications (W-51 «показывает уведомление»), announced politely to screen readers. */
import { useTranslation } from 'react-i18next';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

export function Toasts(): JSX.Element {
  const { t } = useTranslation();
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite" aria-label={t('a11y.toasts')}>
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast--${x.kind ?? 'info'}`}>
          <Icon name={x.kind === 'error' ? 'info' : 'check'} />
          <p>{t(x.key, x.params)}</p>
          {x.action && (
            <button type="button" className="btn btn--sm" onClick={() => { x.action!.onClick(); dismiss(x.id); }}>
              {t(x.action.key)}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => dismiss(x.id)} aria-label={t('common.dismiss')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
