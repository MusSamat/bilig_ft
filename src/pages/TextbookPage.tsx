/**
 * Textbook page (contract 0.5.0, «урок за 5 минут по вашему учебнику»): the
 * teacher's menu textbook → chapter → lesson → topic. Each chapter shows its
 * number, title, subject and pages; each lesson its number, kind and pages.
 * A lesson with one topic links straight to the topic; several topics (and
 * every review lesson, which maps to the whole chapter) show topic cards; a
 * lesson without published topics is shown as «скоро». The opened textbook
 * (and the chapter of the last chosen lesson) is remembered for Home.
 */
import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  t as tr,
  textbookSubjects,
  type Catalog,
  type TextbookChapter,
  type TextbookLesson,
  type TopicSummary,
} from '@bilig/content-model';
import { subjectSwatch } from '@bilig/scene-core';
import { isApiError } from '../api/client';
import { useCatalog, useTextbook } from '../api/content';
import { Icon } from '../components/Icon';
import { SubjectChip } from '../components/SubjectChip';
import { Thumb } from '../components/Thumb';
import { useLang } from '../lib/hooks';
import { pagesLabel } from '../lib/textbook';
import { topicPath } from '../lib/urls';
import { chapterAnchor, useLastTextbook } from '../state/textbook';
import { useUi } from '../state/ui';

export default function TextbookPage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { key } = useParams();
  const { hash } = useLocation();
  const { data, isLoading, error, refetch } = useTextbook(key);
  const { data: catalog } = useCatalog();
  const setContext = useUi((s) => s.setContext);
  const remember = useLastTextbook((s) => s.remember);

  useEffect(() => setContext(null), [setContext]);
  useEffect(() => {
    if (data) remember(data.textbook.key);
  }, [data, remember]);
  // Anchor from the topic badge (`#tb-ch8`): scroll once the chapters are rendered.
  useEffect(() => {
    if (!data || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [data, hash]);

  if (isLoading || (!data && !error)) {
    return (
      <div className="page page--mid" aria-busy="true" aria-label={t('common.loading')}>
        <span className="panel glass skel" style={{ height: 150 }} />
        {[0, 1, 2].map((i) => (
          <span key={i} className="card skel" style={{ height: 220 }} />
        ))}
      </div>
    );
  }
  if (error || !data) {
    const notFound = isApiError(error) && error.status === 404;
    return (
      <div className="page page--narrow">
        <section className="card stack" aria-labelledby="tb-error">
          <h1 id="tb-error" className="page-title">
            {notFound ? t('textbook.notFound') : t('textbook.loadError')}
          </h1>
          <div className={`state${notFound ? '' : ' state--error'}`} role={notFound ? undefined : 'alert'}>
            <Icon name={notFound ? 'search' : 'warn'} />
            <span>{notFound ? t('textbook.notFoundHint') : isApiError(error) ? t(error.i18nKey, { defaultValue: t('common.error') }) : t('common.error')}</span>
            <div className="row">
              {!notFound && (
                <button type="button" className="cta" onClick={() => refetch()}>
                  <Icon name="reset" className="sm" />
                  {t('common.retry')}
                </button>
              )}
              <Link className="btn2" to={`/${lang}`}>
                <Icon name="home" className="sm" />
                {t('notFound.home')}
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const { textbook, topics } = data;
  const subjects = textbookSubjects(textbook)
    .map((k) => catalog?.subjects.find((s) => s.key === k))
    .filter((s) => !!s);
  const meta = [
    t('textbook.grade', { grade: textbook.grade }),
    textbook.part ? t('textbook.part', { part: textbook.part }) : null,
    t('textbook.chapters', { count: textbook.chapters.length }),
    textbook.authors?.join(', '),
    textbook.publisher,
    textbook.year ? String(textbook.year) : null,
  ].filter(Boolean);

  return (
    <div className="page page--mid tb-page">
      <section className="panel glass tb-hero" aria-labelledby="tb-title">
        <p className="tb-hero__eyebrow">
          <Icon name="book" className="sm" />
          {t('textbook.my')}
        </p>
        <h1 id="tb-title">{tr(textbook.title, lang)}</h1>
        <p className="tb-hero__meta">{meta.join(' · ')}</p>
        {subjects.length > 0 && (
          <div className="chips">
            {subjects.map((s) => (
              <SubjectChip key={s.key} subject={s} />
            ))}
          </div>
        )}
        <p className="lead-text">{t('textbook.lead')}</p>
        <nav aria-label={t('textbook.contents')} className="tb-toc">
          {textbook.chapters.map((c) => (
            <a key={c.key} className="chip sm" href={`#${chapterAnchor(c.key)}`}>
              <b>{c.number}</b> {tr(c.title, lang)}
            </a>
          ))}
        </nav>
      </section>

      {textbook.chapters.map((c) => (
        <Chapter key={c.key} textbookKey={textbook.key} chapter={c} topics={topics} catalog={catalog} />
      ))}
    </div>
  );
}

function Chapter(props: { textbookKey: string; chapter: TextbookChapter; topics: TopicSummary[]; catalog: Catalog | undefined }): JSX.Element {
  const { textbookKey, chapter, topics, catalog } = props;
  const { t } = useTranslation();
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const subject = catalog?.subjects.find((s) => s.key === chapter.subjectKey);
  const sw = subjectSwatch(subject?.hue ?? 220, theme);
  const pages = pagesLabel(chapter.pages, t);
  const headingId = `${chapterAnchor(chapter.key)}-title`;
  return (
    <section id={chapterAnchor(chapter.key)} className="card tb-chapter" aria-labelledby={headingId}>
      <header className="tb-chapter__h">
        <span className="tb-chapter__num" style={{ background: sw.bg, color: sw.fg }} aria-hidden="true">
          {chapter.number}
        </span>
        <div>
          {/^\d+$/.test(chapter.number) && <p className="tb-chapter__eyebrow">{t('textbook.chapter', { number: chapter.number })}</p>}
          <h2 id={headingId}>{tr(chapter.title, lang)}</h2>
        </div>
        <div className="tb-chapter__meta">
          {subject && <SubjectChip subject={subject} />}
          {pages && <span className="tb-pages">{pages}</span>}
        </div>
      </header>
      <ol className="tb-lessons">
        {chapter.lessons.map((l) => (
          <li key={l.key} id={`tb-${l.key}`}>
            <Lesson textbookKey={textbookKey} chapter={chapter} lesson={l} topics={topics} catalog={catalog} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function KindLabel({ kind }: { kind: TextbookLesson['kind'] }): JSX.Element {
  const { t } = useTranslation();
  const cls = kind === 'review' ? 'badge badge--ok' : kind === 'extra' ? 'badge' : 'pill pill--muted';
  return <span className={`${cls} tb-kind tb-kind--${kind}`}>{t(`textbook.kind.${kind}`)}</span>;
}

function Lesson(props: {
  textbookKey: string;
  chapter: TextbookChapter;
  lesson: TextbookLesson;
  topics: TopicSummary[];
  catalog: Catalog | undefined;
}): JSX.Element {
  const { textbookKey, chapter, lesson, topics, catalog } = props;
  const { t } = useTranslation();
  const lang = useLang();
  const remember = useLastTextbook((s) => s.remember);
  const pages = pagesLabel(lesson.pages, t);
  const title = tr(lesson.title, lang);
  const onOpen = () => remember(textbookKey, chapter.key);
  const cards = lesson.topicKeys.map((k) => topics.find((x) => x.key === k)).filter((x) => !!x);

  const head = (
    <>
      <span className="tb-lesson__num">{lesson.number || <Icon name={lesson.kind === 'review' ? 'reset' : 'plus'} className="sm" />}</span>
      <span className="tb-lesson__body">
        <b>{title}</b>
        <span className="tb-lesson__meta">
          <KindLabel kind={lesson.kind} />
          {pages && <span className="tb-pages">{pages}</span>}
        </span>
      </span>
    </>
  );

  if (cards.length === 0) {
    return (
      <div className="tb-lesson is-soon" aria-disabled="true" title={t('textbook.soonHint')}>
        {head}
        <span className="pill pill--muted tb-soon">
          <Icon name="clock" className="sm" />
          {t('textbook.soon')}
        </span>
      </div>
    );
  }

  if (cards.length === 1 && lesson.kind !== 'review') {
    const tp = cards[0];
    return (
      <Link className="tb-lesson is-link" to={topicPath(catalog, lang, tp.key, tp.subjectKey)} onClick={onOpen}>
        {head}
        {tr(tp.title, lang) !== title && (
          <span className="tb-lesson__topic">
            <Icon name="cube" className="sm" />
            {tr(tp.title, lang)}
          </span>
        )}
        <Icon name="chev" className="tb-lesson__go" />
      </Link>
    );
  }

  return (
    <div className="tb-lesson tb-lesson--group">
      {head}
      {lesson.kind === 'review' && <p className="tb-lesson__hint">{t('textbook.reviewHint')}</p>}
      <div className="topic-grid">
        {cards.map((tp) => {
          const subject = catalog?.subjects.find((s) => s.key === tp.subjectKey);
          const thumb = tp.thumb && /^(https?:)?\//.test(tp.thumb) ? tp.thumb : undefined;
          return (
            <Link key={tp.key} className="topic-tile" to={topicPath(catalog, lang, tp.key, tp.subjectKey)} onClick={onOpen}>
              <span className="th">
                <Thumb src={thumb} alt="" hue={subject?.hue ?? 200} icon={subject?.icon ?? 'book'} width={58} height={58} />
              </span>
              <span>
                <b>{tr(tp.title, lang)}</b>
                <small>{subject ? tr(subject.title, lang) : ''}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
