/**
 * One 16:9 slide in the Workbench style (prototype `.slide`): accent kicker,
 * serif title, text or steps on the left, the snapshot on the right. Used by
 * the slides dialog and the editor preview.
 */
import type { Slide } from '@bilig/content-model/api';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { Formula } from '../lib/formula';

export const slideTitle = (s: Slide): string => (s.kind === 'snapshot' ? s.caption ?? '' : s.title);

export function SlideView({ slide, image, kicker, icon }: { slide: Slide; image?: string; kicker?: string; icon?: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={`slide slide--${slide.kind}${image ? '' : ' slide--noimg'}`} role="group" aria-label={t('deck.preview')}>
      <div className="slide__text">
        {slide.kind === 'title' ? (
          <p className="k">
            <LogoMark size={22} />
            {t('app.title')}
          </p>
        ) : (
          kicker && (
            <p className="k">
              {icon && <Icon name={icon} className="sm" />}
              {kicker}
            </p>
          )
        )}
        <h4>{slideTitle(slide) || t(`deck.kind.${slide.kind}`)}</h4>
        {slide.kind === 'title' && slide.subtitle && <p>{slide.subtitle}</p>}
        {(slide.kind === 'concept' || slide.kind === 'text') &&
          slide.text
            .split('\n')
            .filter(Boolean)
            .map((x, i) => <p key={i}>{x}</p>)}
        {slide.kind === 'process' && (
          <>
            {slide.equation && (
              <p className="slide__eq">
                <Formula tex={slide.equation} />
              </p>
            )}
            <ol>
              {slide.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </>
        )}
      </div>
      {image && <img src={image} alt={t('deck.snapshotAlt')} />}
    </div>
  );
}
