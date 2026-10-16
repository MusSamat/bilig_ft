/**
 * Slides dialog (Workbench `#modal`): the current presentation, or — when it
 * is empty on a topic page — the deterministic template built from the topic,
 * one slide at a time with ← / → keys, Esc to close, and a link to the editor.
 * Lazy chunk (opened from the header CTA).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { useTopicPackage } from '../api/content';
import { Icon } from '../components/Icon';
import { db, type SnapshotRow } from '../lib/db';
import { useFocusTrap, useKeydown, useLang } from '../lib/hooks';
import { useDeck } from '../state/deck';
import { useUi } from '../state/ui';
import { slideImageId } from './render';
import { SlideView } from './SlideView';
import { templateSlides } from './template';

export default function SlidesDialog(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const close = useUi((s) => s.closeSlides);
  const context = useUi((s) => s.context);
  const deck = useDeck();
  const { data: loaded } = useTopicPackage(deck.slides.length ? deck.topicKey || undefined : context?.topicKey);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useKeydown((e) => e.key === 'Escape' && close(), { allowInInputs: true });

  useEffect(() => {
    void db.snapshots.toArray().then(setSnapshots).catch(() => setSnapshots([]));
  }, []);
  const images = useMemo(() => new Map(snapshots.map((s) => [s.id, s.image])), [snapshots]);
  const slides = useMemo(() => {
    if (deck.slides.length) return deck.slides;
    if (!loaded) return [];
    const refs = snapshots.filter((s) => s.topicKey === loaded.pkg.topic.key).map((s) => ({ id: s.id, focus: s.sceneState.focus, createdAt: s.createdAt }));
    return templateSlides(loaded.pkg, lang, refs);
  }, [deck.slides, loaded, snapshots, lang]);
  const n = slides.length;
  const cur = n ? slides[Math.min(i, n - 1)] : undefined;
  const go = (d: number) => n && setI((x) => (x + d + n) % n);
  useKeydown((e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
  });
  const subject = loaded?.pkg.subject;
  const kicker = cur?.kind === 'process' ? t('activities.process') : loaded ? tr(loaded.pkg.topic.title, lang) : deck.title;

  return (
    <div className="sheet sheet--center" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="deckdlg" role="dialog" aria-modal="true" aria-labelledby="slides-title" ref={ref}>
        <h2 id="slides-title" className="visually-hidden">
          {t('deck.title')}
        </h2>
        {cur ? (
          <SlideView slide={cur} image={slideImageId(cur) ? images.get(slideImageId(cur)!) : undefined} kicker={kicker} icon={subject?.icon} />
        ) : (
          <div className="slide slide--empty">
            <div className="state">
              <Icon name="deck" />
              <b>{t('deck.emptyTitle')}</b>
              <span>{t('deck.empty')}</span>
            </div>
          </div>
        )}
        <div className="dfoot">
          <small>{deck.slides.length ? t('deck.slides', { count: n }) : t('deck.draftNote')}</small>
          {n > 0 && (
            <span aria-live="polite">
              {Math.min(i, n - 1) + 1} / {n}
            </span>
          )}
          <button type="button" className="ibtn glass" onClick={() => go(-1)} disabled={n < 2} aria-label={t('deck.prevSlide')}>
            <Icon name="prev" />
          </button>
          <button type="button" className="ibtn glass" onClick={() => go(1)} disabled={n < 2} aria-label={t('deck.nextSlide')}>
            <Icon name="next" />
          </button>
          <Link className="btn2" to={`/${lang}/presentation`} onClick={close}>
            <Icon name="pencil" className="sm" />
            {t('deck.openEditor')}
          </Link>
          <button type="button" className="ibtn glass" onClick={close} aria-label={t('common.close')}>
            <Icon name="x" />
          </button>
        </div>
      </div>
    </div>
  );
}
