/**
 * Presentation editor (W-51/W-52): title slide, a slide per structure, process
 * slides; reorder, edit text and notes; preview with paging; export PPTX
 * (pptxgenjs) and PDF (jsPDF), both lazy-loaded and fully client-side; a
 * signed-in user can save the deck to the server (POST/PATCH /presentations,
 * snapshots uploaded via POST /snapshots). Snapshot slides reopen live.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Slide } from '@bilig/content-model/api';
import { snapshotUrl } from '@bilig/scene-core';
import { api, isApiError } from '../api/client';
import { useTopicPackage } from '../api/content';
import { useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { db, type SnapshotRow } from '../lib/db';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { useDeck } from '../state/deck';
import { toast, useUi } from '../state/ui';
import { templateSlides } from './template';
import { slideImageId, type ExportContext } from './render';

const slideTitle = (s: Slide): string => (s.kind === 'snapshot' ? s.caption ?? '' : s.title);

export default function PresentationPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const deck = useDeck();
  const authed = useSession((s) => s.status === 'authed');
  const setContext = useUi((s) => s.setContext);
  const { data: loaded } = useTopicPackage(deck.topicKey || undefined);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState<null | 'pptx' | 'pdf' | 'save'>(null);

  useEffect(() => setContext(null), [setContext]);
  useEffect(() => {
    void db.snapshots.toArray().then(setSnapshots).catch(() => setSnapshots([]));
  }, [deck.slides.length]);

  const images = useMemo(() => new Map(snapshots.map((s) => [s.id, s.image])), [snapshots]);
  const slides = deck.slides;
  const sel = slides[Math.min(current, slides.length - 1)];
  const hue = loaded?.pkg.subject.hue ?? 220;

  const fromTopic = () => {
    if (!loaded) return;
    const refs = snapshots.filter((s) => s.topicKey === loaded.pkg.topic.key).map((s) => ({ id: s.id, focus: s.sceneState.focus, createdAt: s.createdAt }));
    const generated = templateSlides(loaded.pkg, lang, refs);
    const extras = slides.filter((s) => s.kind === 'snapshot' || s.kind === 'text');
    deck.replaceSlides([...generated, ...extras]);
    if (!deck.title) deck.setMeta({ title: generated[0].kind === 'title' ? generated[0].title : '' });
    setCurrent(0);
  };

  const exportCtx = (): ExportContext => ({ title: deck.title || (sel ? slideTitle(sel) : ''), hue, images, labels: { steps: t('deck.stepsTitle') } });
  const fileName = (deck.title || 'bilig').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'bilig';

  const doExport = async (kind: 'pptx' | 'pdf') => {
    setBusy(kind);
    try {
      if (kind === 'pptx') await (await import('./exportPptx')).exportPptx(slides, exportCtx(), fileName);
      else await (await import('./exportPdf')).exportPdf(slides, exportCtx(), fileName);
    } catch {
      toast({ key: 'deck.exportFailed', kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveServer = async () => {
    setBusy('save');
    try {
      // Upload snapshots that only exist on this device; slides reference server ids.
      const idMap = new Map<string, string>();
      for (const s of slides) {
        const id = slideImageId(s);
        if (!id || idMap.has(id)) continue;
        const row = snapshots.find((x) => x.id === id);
        if (!row) continue;
        let serverId = row.serverId;
        if (!serverId) {
          const res = await api('snapshotCreate', { body: { topicKey: row.topicKey, topicVersion: row.topicVersion, image: row.image, sceneState: row.sceneState } });
          serverId = res.id;
          await db.snapshots.update(row.id, { serverId });
        }
        idMap.set(id, serverId);
      }
      const mapped = slides.map((s) => {
        const id = slideImageId(s);
        return id && idMap.has(id) ? ({ ...s, snapshotId: idMap.get(id)! } as Slide) : s;
      });
      const title = deck.title || t('deck.title');
      const p = deck.serverId
        ? await api('presentationPatch', { params: { id: deck.serverId }, body: { title, slides: mapped, version: deck.serverVersion ?? 0 }, ifMatch: deck.serverVersion ?? 0 })
        : await api('presentationCreate', { body: { topicKey: deck.topicKey, title, lang, mode: 'template', slides: mapped } });
      deck.setMeta({ serverId: p.id, serverVersion: p.version });
      toast({ key: 'deck.savedServer', kind: 'success' });
    } catch (e) {
      toast({ key: isApiError(e) && e.code === 'version_mismatch' ? 'errors.version_mismatch' : 'deck.saveFailed', kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{t('deck.title')}</h1>
        <span className="muted">{t('deck.slides', { count: slides.length })}</span>
      </div>
      <div className="row">
        <label className="field" style={{ flex: '1 1 260px' }}>
          <span>{t('deck.deckTitle')}</span>
          <input className="input" value={deck.title} onChange={(e) => deck.setMeta({ title: e.target.value })} />
        </label>
      </div>
      <div className="row no-print">
        <button type="button" className="btn" disabled={!loaded} onClick={fromTopic} title={t('deck.fromTopicHint')}>
          <Icon name="layers" />
          {t('deck.fromTopic')}
        </button>
        <button type="button" className="btn btn--primary" disabled={!slides.length || !!busy} onClick={() => void doExport('pptx')}>
          <Icon name="download" />
          {busy === 'pptx' ? t('deck.exporting') : t('deck.exportPptx')}
        </button>
        <button type="button" className="btn" disabled={!slides.length || !!busy} onClick={() => void doExport('pdf')}>
          <Icon name="download" />
          {busy === 'pdf' ? t('deck.exporting') : t('deck.exportPdf')}
        </button>
        {authed ? (
          <button type="button" className="btn" disabled={!slides.length || !!busy || !deck.topicKey} onClick={() => void saveServer()}>
            <Icon name="upload" />
            {t('deck.saveServer')}
          </button>
        ) : (
          <span className="muted small">{t('deck.savedLocal')}</span>
        )}
        {slides.length > 0 && (
          <button type="button" className="btn btn--ghost" onClick={() => deck.clear()}>
            <Icon name="trash" />
            {t('deck.clear')}
          </button>
        )}
      </div>

      {!slides.length ? (
        <p className="card">{t('deck.empty')}</p>
      ) : (
        <div className="deck">
          <ol className="slide-list" aria-label={t('deck.slides', { count: slides.length })}>
            {slides.map((s, i) => (
              <li key={s.id} className="slide-item" aria-current={i === current ? 'true' : undefined}>
                <button type="button" onClick={() => setCurrent(i)}>
                  <span className="muted small">
                    {t('deck.slideN', { n: i + 1 })} · {t(`deck.kind.${s.kind}`)}
                  </span>
                  <b>{slideTitle(s) || t(`deck.kind.${s.kind}`)}</b>
                </button>
                <span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => { deck.moveSlide(s.id, -1); setCurrent(i - 1); }} aria-label={t('deck.moveUp')}>
                    <Icon name="up" size={18} />
                  </button>
                  <button type="button" className="icon-btn" disabled={i === slides.length - 1} onClick={() => { deck.moveSlide(s.id, 1); setCurrent(i + 1); }} aria-label={t('deck.moveDown')}>
                    <Icon name="down" size={18} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => { deck.removeSlide(s.id); setCurrent(Math.max(0, i - 1)); }} aria-label={t('deck.remove')}>
                    <Icon name="trash" size={18} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {sel && (
            <div className="stack">
              <SlidePreview slide={sel} image={slideImageId(sel) ? images.get(slideImageId(sel)!) : undefined} hue={hue} />
              <div className="row no-print">
                <button type="button" className="icon-btn" disabled={current === 0} onClick={() => setCurrent(current - 1)} aria-label={t('deck.prevSlide')}>
                  <Icon name="arrow-left" />
                </button>
                <span>{t('deck.slideN', { n: current + 1 })}</span>
                <button type="button" className="icon-btn" disabled={current >= slides.length - 1} onClick={() => setCurrent(current + 1)} aria-label={t('deck.nextSlide')}>
                  <Icon name="arrow-right" />
                </button>
                {sel.kind === 'snapshot' && (
                  <SnapshotLiveLink snapshot={snapshots.find((x) => x.id === sel.snapshotId)} onOpen={(u) => navigate(u)} />
                )}
              </div>
              <SlideEditor slide={sel} onChange={(patch) => deck.updateSlide(sel.id, patch)} />
            </div>
          )}
        </div>
      )}
      <Link to={`/${lang}`} className="muted small no-print">
        {t('notFound.home')}
      </Link>
    </div>
  );
}

function SnapshotLiveLink({ snapshot, onOpen }: { snapshot?: SnapshotRow; onOpen(url: string): void }): JSX.Element | null {
  const { t } = useTranslation();
  if (!snapshot) return null;
  return (
    <button type="button" className="btn btn--sm" onClick={() => onOpen(snapshotUrl({ image: snapshot.image, sceneState: snapshot.sceneState }))}>
      <Icon name="eye" size={18} />
      {t('deck.openLive')}
    </button>
  );
}

function SlidePreview({ slide, image, hue }: { slide: Slide; image?: string; hue: number }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="slide-preview" style={{ ['--deck-hue' as string]: String(hue) }} aria-label={t('deck.preview')} role="group">
      <h3>{slideTitle(slide)}</h3>
      {slide.kind === 'title' && slide.subtitle && <p>{slide.subtitle}</p>}
      {(slide.kind === 'concept' || slide.kind === 'text') && <p style={{ whiteSpace: 'pre-line' }}>{slide.text}</p>}
      {slide.kind === 'process' && (
        <>
          {slide.equation && <Formula tex={slide.equation} />}
          <ol>
            {slide.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {image && <img src={image} alt={t('deck.snapshotAlt')} />}
    </div>
  );
}

function SlideEditor({ slide, onChange }: { slide: Slide; onChange(patch: Partial<Slide>): void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="card stack no-print">
      {slide.kind === 'snapshot' ? (
        <label className="field">
          <span>{t('deck.caption')}</span>
          <input className="input" value={slide.caption ?? ''} onChange={(e) => onChange({ caption: e.target.value } as Partial<Slide>)} />
        </label>
      ) : (
        <label className="field">
          <span>{t('deck.slideTitle')}</span>
          <input className="input" value={slide.title} onChange={(e) => onChange({ title: e.target.value } as Partial<Slide>)} />
        </label>
      )}
      {slide.kind === 'title' && (
        <label className="field">
          <span>{t('deck.slideText')}</span>
          <input className="input" value={slide.subtitle ?? ''} onChange={(e) => onChange({ subtitle: e.target.value } as Partial<Slide>)} />
        </label>
      )}
      {(slide.kind === 'concept' || slide.kind === 'text') && (
        <label className="field">
          <span>{t('deck.slideText')}</span>
          <textarea className="input" value={slide.text} onChange={(e) => onChange({ text: e.target.value } as Partial<Slide>)} />
        </label>
      )}
      {slide.kind === 'process' && (
        <label className="field">
          <span>{t('deck.stepsTitle')}</span>
          <textarea className="input" value={slide.steps.join('\n')} onChange={(e) => onChange({ steps: e.target.value.split('\n') } as Partial<Slide>)} />
        </label>
      )}
      <label className="field">
        <span>{t('deck.notes')}</span>
        <textarea className="input" value={slide.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value } as Partial<Slide>)} />
      </label>
    </div>
  );
}
