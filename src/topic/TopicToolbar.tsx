/**
 * Topic toolbar — the controls that act on THIS topic, at the top of the topic
 * panel next to the breadcrumbs: Lesson / Explore mode (the lesson is the
 * default, `?view=study` explores), the language of the lesson, and the
 * topic's ready-made presentation (.pptx / .pdf generated on the server).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@bilig/content-model';
import { isApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { LangMenu } from '../components/LangMenu';
import { useMenu } from '../components/Menu';
import { saveFile } from '../lib/download';
import { useLang } from '../lib/hooks';
import { isLessonView, withView } from '../lib/view';
import {
  fetchTopicDeck,
  type TopicDeckFormat,
} from '../presentation/topicDeck';
import { toast } from '../state/ui';

export function TopicToolbar({ topicKey }: { topicKey: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="ttools" role="toolbar" aria-label={t('topic.toolbar')}>
      <ViewToggle />
      <LangMenu />
      <DeckMenu topicKey={topicKey} />
    </div>
  );
}

function ViewToggle(): JSX.Element {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const lessonOn = isLessonView(params);
  const setView = (lesson: boolean) => {
    if (lesson !== lessonOn)
      setParams(withView(params, lesson), { replace: false });
  };
  return (
    <div
      className="seg ttools__view"
      role="group"
      aria-label={t('header.viewMode')}
    >
      <button
        type="button"
        aria-pressed={lessonOn}
        onClick={() => setView(true)}
        title={t('header.lessonHint')}
        aria-describedby="tt-lesson-hint"
      >
        <Icon name="deck" className="sm" />
        {t('header.lesson')}
      </button>
      <button
        type="button"
        aria-pressed={!lessonOn}
        onClick={() => setView(false)}
        title={t('header.studyHint')}
        aria-describedby="tt-study-hint"
      >
        <Icon name="cube" className="sm" />
        {t('header.study')}
      </button>
      <span id="tt-lesson-hint" className="visually-hidden">
        {t('header.lessonHint')}
      </span>
      <span id="tt-study-hint" className="visually-hidden">
        {t('header.studyHint')}
      </span>
    </div>
  );
}

const deckErrorKey = (e: unknown): string => {
  if (!isApiError(e)) return 'header.deck.failed';
  if (e.status === 401) return 'header.deck.needSignIn';
  if (e.status === 403 || e.i18nKey === 'errors.license_required')
    return 'header.deck.noLicence';
  return e.status === 0 ? e.i18nKey : 'header.deck.failed';
};

/** «Презентация ▾»: the topic's ready-made presentation in the lesson language. */
function DeckMenu({ topicKey }: { topicKey: string }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const [busy, setBusy] = useState<TopicDeckFormat | null>(null);
  const m = useMenu();

  const download = async (format: TopicDeckFormat, l: Lang) => {
    m.close(true);
    setBusy(format);
    try {
      saveFile(await fetchTopicDeck(topicKey, l, format));
      toast({ key: 'header.deck.downloaded', kind: 'success' });
    } catch (e) {
      toast({ key: deckErrorKey(e), kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rel" ref={m.rootRef}>
      <button
        type="button"
        className="cta ttools__deck text-sm"
        {...m.buttonProps}
        aria-busy={busy ? true : undefined}
        aria-label={busy ? t('header.deck.preparing') : t('header.deck.menu')}
        title={t('header.deck.menu')}
      >
        <Icon
          name={busy ? 'sync' : 'download'}
          className={busy ? 'spin sm' : 'sm'}
        />
        <span>
          {busy ? t('header.deck.preparingShort') : t('header.present')}
        </span>
        <Icon name="down" className="sm" />
      </button>
      <span className="visually-hidden" role="status">
        {busy ? t('header.deck.preparing') : ''}
      </span>
      {m.open && (
        <div
          className="menu"
          {...m.menuProps}
          aria-label={t('header.deck.menu')}
        >
          {(['pptx', 'pdf'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              disabled={!!busy}
              aria-disabled={busy ? true : undefined}
              onClick={() => void download(f, lang)}
            >
              <Icon name="download" />
              {t(`header.deck.${f}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
