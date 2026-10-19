/**
 * Where the topic appears in the teacher's textbooks (contract 0.5.0): a small
 * badge «Табигый илимдер 8 · § 8.1 · стр. 176–185» under the crumbs, linking
 * back to the textbook page at that chapter. The remembered textbook comes first.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { placesOfTopic, type Catalog } from '@bilig/content-model';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { placeLabel, textbookPath } from '../lib/textbook';
import { useLastTextbook } from '../state/textbook';

export function TextbookPlaces({ catalog, topicKey }: { catalog: Catalog | undefined; topicKey: string }): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const last = useLastTextbook((s) => s.last);
  const remember = useLastTextbook((s) => s.remember);
  const textbooks = catalog?.textbooks ?? [];
  const places = placesOfTopic(textbooks, topicKey).sort((a, b) => Number(b.textbookKey === last?.key) - Number(a.textbookKey === last?.key));
  if (!places.length) return null;
  return (
    <p className="tb-places">
      {places.map((p) => {
        const tb = textbooks.find((x) => x.key === p.textbookKey)!;
        const label = placeLabel(tb, p, lang, t);
        return (
          <Link
            key={`${p.textbookKey}:${p.lessonKey}`}
            className="badge tb-place"
            to={textbookPath(lang, tb.key, p.chapterKey)}
            aria-label={t('textbook.placeLabel', { place: label })}
            onClick={() => remember(tb.key, p.chapterKey)}
          >
            <Icon name="book" className="sm" />
            {label}
          </Link>
        );
      })}
    </p>
  );
}
