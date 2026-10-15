/** App header (TZ W-01): subject button, study/lesson, language, theme, sign-in. */
import { useTranslation } from 'react-i18next';
import type { Lang } from '@bilig/content-model';
import { useStore } from '../store';

const LANGS: Lang[] = ['ru', 'ky', 'en'];

export function Header({
  subjectTitle,
  onOpenCatalog,
}: {
  subjectTitle?: string;
  onOpenCatalog: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  return (
    <header className="header">
      <div className="header__left">
        <span className="brand">Bilig</span>
        <button className="chip chip--subject" onClick={onOpenCatalog}>
          <span className="chip__dot" />
          {subjectTitle ?? t('header.subject')}
        </button>
      </div>

      <div className="segmented">
        <button
          className={view === 'study' ? 'is-active' : ''}
          onClick={() => setView('study')}
        >
          {t('header.study')}
        </button>
        <button
          className={view === 'lesson' ? 'is-active' : ''}
          onClick={() => setView('lesson')}
        >
          {t('header.lesson')}
        </button>
      </div>

      <div className="header__right">
        <div className="segmented segmented--lang">
          {LANGS.map((l) => (
            <button
              key={l}
              className={lang === l ? 'is-active' : ''}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="icon-btn" title={t('header.theme')} onClick={toggleTheme}>
          {theme === 'dark' ? '☾' : '☀'}
        </button>
        <button className="btn btn--ghost">{t('header.login')}</button>
      </div>
    </header>
  );
}
