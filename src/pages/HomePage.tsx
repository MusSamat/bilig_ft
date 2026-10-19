/**
 * Home (W-01/W-02, scenario «Ученик» 2), Workbench style: a brand hero with
 * the catalog as the one primary action and the subjects beside it, then the
 * pupil's assignments, recently opened topics and featured topics. Loading
 * shows reserved skeletons; a failed catalog shows an inline retry.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { subjectModelCount, t as tr, textbookSubjects, type Catalog, type Subject } from '@bilig/content-model';
import { subjectSwatch } from '@bilig/scene-core';
import { useCatalog, useTextbooks } from '../api/content';
import { useSession } from '../api/session';
import { RecentTopics } from '../cabinet/RecentTopics';
import { StudentAssignments } from '../cabinet/StudentAssignments';
import { Icon } from '../components/Icon';
import { SubjectChip } from '../components/SubjectChip';
import { LogoMark } from '../components/Logo';
import { Thumb } from '../components/Thumb';
import { Formula } from '../lib/formula';
import { useLang } from '../lib/hooks';
import { textbookPath, textbookShortTitle } from '../lib/textbook';
import { topicPath } from '../lib/urls';
import { useLastTextbook } from '../state/textbook';
import { useUi } from '../state/ui';

function SubjectTile({ subject, count }: { subject: Subject; count: number }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const openCatalog = useUi((s) => s.openCatalog);
  const locked = subject.status === 'soon';
  const title = tr(subject.title, lang);
  const sw = subjectSwatch(subject.hue, theme);
  return (
    <button
      type="button"
      className="sc"
      aria-disabled={locked || undefined}
      aria-label={locked ? t('catalog.locked', { name: title }) : `${title}, ${t('catalog.models', { count })}`}
      onClick={() => !locked && openCatalog(subject.key)}
    >
      <span className="si" style={{ background: sw.bg, color: sw.fg }}>
        <Icon name={subject.icon} className="lg" />
      </span>
      <span>
        <b>{title}</b>
        <small>
          {locked ? (
            <>
              <Icon name="lock" className="sm" /> {t('catalog.coming')}
            </>
          ) : (
            t('catalog.models', { count })
          )}
        </small>
      </span>
    </button>
  );
}

/**
 * «Мой учебник» (contract 0.5.0): the teacher's textbooks above the subjects,
 * with «Продолжить: …» back to the last opened textbook and chapter.
 */
function HomeTextbooks({ catalog }: { catalog: Catalog | undefined }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const last = useLastTextbook((s) => s.last);
  const { data, isLoading } = useTextbooks();
  if (isLoading) {
    return (
      <section aria-labelledby="home-textbooks" aria-busy="true">
        <h2 id="home-textbooks" className="grp">
          {t('textbook.my')}
        </h2>
        <span className="skel" style={{ display: 'block', height: 92, borderRadius: 'var(--r-lg)' }} />
      </section>
    );
  }
  const items = data?.items ?? [];
  if (!items.length) return null;
  const lastBook = last && items.find((tb) => tb.key === last.key);
  const lastChapter = lastBook && last.chapterKey ? lastBook.chapters.find((c) => c.key === last.chapterKey) : undefined;
  const sorted = lastBook ? [lastBook, ...items.filter((tb) => tb !== lastBook)] : items;
  return (
    <section aria-labelledby="home-textbooks" className="home-textbooks">
      <h2 id="home-textbooks" className="grp">
        {t('textbook.my')}
      </h2>
      {lastBook && (
        <Link className="btn2 home-textbooks__continue" to={textbookPath(lang, lastBook.key, lastChapter?.key)}>
          <Icon name="play" className="sm" />
          {lastChapter
            ? t('textbook.continueChapter', { title: textbookShortTitle(lastBook, lang, t), number: lastChapter.number })
            : t('textbook.continue', { title: textbookShortTitle(lastBook, lang, t) })}
        </Link>
      )}
      <div className="home-textbooks__list">
        {sorted.map((tb) => {
          const subjects = textbookSubjects(tb)
            .map((k) => catalog?.subjects.find((s) => s.key === k))
            .filter((s) => !!s);
          const meta = [t('textbook.grade', { grade: tb.grade }), tb.part ? t('textbook.part', { part: tb.part }) : null, t('textbook.chapters', { count: tb.chapters.length })];
          return (
            <Link key={tb.key} className="tb-card" to={textbookPath(lang, tb.key)}>
              <span className="tb-card__ic" aria-hidden="true">
                <Icon name="book" className="lg" />
              </span>
              <span className="tb-card__body">
                <b>{tr(tb.title, lang)}</b>
                <small>{meta.filter(Boolean).join(' · ')}</small>
                {subjects.length > 0 && (
                  <span className="chips">
                    {subjects.map((s) => (
                      <SubjectChip key={s.key} subject={s} />
                    ))}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
      <small className="home-textbooks__hint">{t('textbook.myHint')}</small>
    </section>
  );
}

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const openCatalog = useUi((s) => s.openCatalog);
  const setContext = useUi((s) => s.setContext);
  const me = useSession((s) => s.me);
  const isStudent = me?.kind === 'student';
  const { data: catalog, isLoading, isError, refetch } = useCatalog();

  useEffect(() => setContext(null), [setContext]);

  return (
    <div className="page">
      <section className="home-hero panel glass" aria-labelledby="home-title">
        <div>
          <div className="home-hero__brand">
            <LogoMark size={44} />
            <b aria-hidden="true">{t('app.title')}</b>
          </div>
          <h1 id="home-title">{t('home.heading')}</h1>
          <p className="lead-text">{t('home.lead')}</p>
          <div className="home-hero__cta">
            <button type="button" className="cta btn--lg" onClick={() => openCatalog()}>
              <Icon name="search" />
              {t('home.openCatalog')}
            </button>
            <span className="home-hero__keys">
              <Icon name="keyboard" className="sm" />
              {t('catalog.hotkey')}
            </span>
          </div>
        </div>
        <div className="home-hero__side">
          <HomeTextbooks catalog={catalog} />
          <section aria-labelledby="home-subjects">
            <h2 id="home-subjects" className="grp">
              {t('home.subjects')}
            </h2>
            {isLoading && (
              <div className="home-subjects" aria-busy="true" aria-label={t('common.loading')}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="skel" style={{ height: 70, borderRadius: 'var(--r-lg)' }} />
                ))}
              </div>
            )}
            {isError && (
              <div className="state state--error" role="alert">
                <Icon name="warn" />
                <b>{t('catalog.loadError')}</b>
                <button type="button" className="btn2" onClick={() => refetch()}>
                  <Icon name="reset" className="sm" />
                  {t('common.retry')}
                </button>
              </div>
            )}
            {catalog && (
              <div className="home-subjects">
                {[...catalog.subjects]
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <SubjectTile key={s.key} subject={s} count={subjectModelCount(catalog, s.key)} />
                  ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {isStudent && <StudentAssignments />}
      <RecentTopics />

      {(isLoading || (catalog && catalog.topics.length > 0)) && (
        <section className="card" aria-labelledby="featured-title">
          <div className="home-section-h">
            <Icon name="cube" className="lg" />
            <h2 id="featured-title">{t('home.featured')}</h2>
            <button type="button" className="btn2" onClick={() => openCatalog()}>
              <Icon name="layers" className="sm" />
              {t('home.allTopics')}
            </button>
          </div>
          <div className="topic-grid">
            {isLoading &&
              Array.from({ length: 6 }, (_, i) => <span key={i} className="skel" style={{ height: 76, borderRadius: 'var(--r-lg)' }} />)}
            {catalog?.topics.slice(0, 12).map((tp) => {
              const subject = catalog.subjects.find((s) => s.key === tp.subjectKey);
              const thumb = tp.thumb && /^(https?:)?\//.test(tp.thumb) ? tp.thumb : undefined;
              return (
                <Link key={tp.key} className="topic-tile" to={topicPath(catalog, lang, tp.key)}>
                  <span className="th">
                    <Thumb src={thumb} alt="" hue={subject?.hue ?? 200} icon={subject?.icon ?? 'book'} width={58} height={58} />
                  </span>
                  <span>
                    <b>
                      {tr(tp.title, lang)}
                      {tp.formula && <>{', '}<Formula tex={tp.formula} /></>}
                    </b>
                    <small>{subject ? tr(subject.title, lang) : ''}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
