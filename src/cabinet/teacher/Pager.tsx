/** Client-side pager for tables without server pagination (assignment results). */
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }): JSX.Element | null {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className="row" aria-label={t('teacher.pagination')}>
      <button type="button" className="icon-btn" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label={t('teacher.prevPage')}>
        <Icon name="arrow-left" />
      </button>
      <span>{t('teacher.page', { n: page + 1, m: pages })}</span>
      <button type="button" className="icon-btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label={t('teacher.nextPage')}>
        <Icon name="arrow-right" />
      </button>
    </nav>
  );
}
