/**
 * First visit after self-registration (`/teacher?welcome=1`): what to do next —
 * create a class, open «My textbook», upload a КТП — and how long the trial lasts.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { useLang } from '../../lib/hooks';
import { daysLeft } from './MySubjectsCard';

export function WelcomeBanner({ onClose, onCreateClass, onKtp }: { onClose: () => void; onCreateClass?: () => void; onKtp?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.me);
  const trial = me?.licenses?.find((l) => l.trial);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className="card stack welcome" aria-labelledby="welcome-title">
      <div className="welcome__h">
        <span className="orb s" aria-hidden="true">
          <Icon name="spark" />
        </span>
        <div>
          <h2 id="welcome-title" ref={ref} tabIndex={-1}>
            {t('teaching.welcome.title', { name: me?.displayName ?? '' })}
          </h2>
          <p className="muted">{trial ? t('teaching.welcome.trial', { count: daysLeft(trial.endsAt) }) : t('teaching.welcome.lead')}</p>
        </div>
        <button type="button" className="ibtn" onClick={onClose} aria-label={t('teaching.welcome.close')} title={t('teaching.welcome.close')}>
          <Icon name="x" />
        </button>
      </div>
      <ol className="welcome__steps">
        <li>
          <b>{t('teaching.welcome.step1')}</b>
          <span className="muted small">{t('teaching.welcome.step1Hint')}</span>
          {onCreateClass && (
            <button type="button" className="btn2 btn--sm" onClick={onCreateClass}>
              <Icon name="plus" className="sm" />
              {t('teaching.welcome.step1Action')}
            </button>
          )}
        </li>
        <li>
          <b>{t('teaching.welcome.step2')}</b>
          <span className="muted small">{t('teaching.welcome.step2Hint')}</span>
          <Link className="btn2 btn--sm" to={`/${lang}`}>
            <Icon name="book" className="sm" />
            {t('teaching.welcome.step2Action')}
          </Link>
        </li>
        <li>
          <b>{t('teaching.welcome.step3')}</b>
          <span className="muted small">{t('teaching.welcome.step3Hint')}</span>
          {onKtp && (
            <button type="button" className="btn2 btn--sm" onClick={onKtp}>
              <Icon name="upload" className="sm" />
              {t('teaching.welcome.step3Action')}
            </button>
          )}
        </li>
      </ol>
    </section>
  );
}
