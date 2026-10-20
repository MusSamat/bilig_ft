/**
 * «Вопросы для класса» (contract 0.4.0): AI-made single-choice questions about
 * the topic or the selected structure, for the teacher to show on the screen.
 * One question at a time in large type; the class answers aloud, the teacher
 * may mark the class's choice, then «Показать ответ» reveals the right option
 * and the explanation. Practice only: nothing is saved. Every question carries
 * the «ИИ» label and the teacher's verdict buttons.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import type { GeneratedQuizItem } from '@bilig/content-model/api';
import { usePermission, useSession } from '../api/session';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';
import { loadMore, loadSeen, useGenerated } from './generated';
import { AiBadge, GradesBadge, FeedbackButtons, MoreButton } from './GeneratedBits';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function PracticeQuiz(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const canAsk = usePermission('assistant.ask.online');
  const selected = useViewer((s) => s.selected);
  const focus = concepts.find((c) => c.key === selected && !c.isContainer);
  const conceptKey = focus?.key;
  const bucket = useGenerated(pkg.topic.key, conceptKey, 'quiz', lang);
  const authed = useSession((s) => s.status === 'authed');
  useEffect(() => {
    if (canAsk && authed) void loadSeen(pkg.topic.key, conceptKey, 'quiz', lang);
  }, [canAsk, authed, pkg.topic.key, conceptKey, lang]);
  const items = bucket.items as GeneratedQuizItem[];
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  // A new set (another structure / language) starts at its first question.
  useEffect(() => setIndex(0), [conceptKey, lang]);
  useEffect(() => {
    setChosen(null);
    setRevealed(false);
  }, [index, conceptKey]);
  // A reported question disappears; stay within the list.
  useEffect(() => {
    if (index > 0 && index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  if (!canAsk) return null;
  const q = items[index];
  const about = focus ? tr(focus.title, lang) : tr(pkg.topic.title, lang);
  const more = () => void loadMore(pkg.topic.key, conceptKey, 'quiz', lang);

  return (
    <section className="practice panel glass" aria-labelledby="practice-title">
      <div className="practice__head">
        <h2 id="practice-title" className="th2">
          <Icon name="users" />
          {t('practice.title')}
        </h2>
        <p className="practice__about">
          {t('practice.about', { name: about })} · <AiBadge />
        </p>
      </div>
      {!q ? (
        <div className="practice__empty">
          <p>{t('practice.hint')}</p>
          <MoreButton label={t('practice.generate')} loading={bucket.loading} exhausted={bucket.exhausted} errorKey={bucket.errorKey} onClick={more} />
        </div>
      ) : (
        <div className="practice__q" data-ask="answer" {...(q.conceptKey ? { 'data-concept': q.conceptKey } : {})}>
          <p className="practice__n">
            {t('practice.counter', { n: index + 1, total: items.length })}
            {q.reviewed && <AiBadge reviewed />}
            <GradesBadge grades={q.grades} />
          </p>
          <p className="practice__prompt">{q.prompt}</p>
          <ul className="practice__opts">
            {q.options.map((o, i) => {
              const state = revealed ? (o.key === q.answer ? ' is-ok' : o.key === chosen ? ' is-bad' : '') : '';
              return (
                <li key={o.key}>
                  <button type="button" className={`practice__opt${state}`} aria-pressed={chosen === o.key} disabled={revealed} onClick={() => setChosen(o.key)}>
                    <span className="practice__letter" aria-hidden="true">
                      {LETTERS[i]}
                    </span>
                    {o.text}
                    {revealed && o.key === q.answer && <span className="visually-hidden"> — {t('practice.correct')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {revealed && (
            <p className="practice__why" role="status">
              <Icon name="check" className="sm" />
              {q.explanation}
            </p>
          )}
          <div className="practice__acts">
            {!revealed ? (
              <button type="button" className="cta" onClick={() => setRevealed(true)}>
                <Icon name="eye" className="sm" />
                {t('practice.reveal')}
              </button>
            ) : index < items.length - 1 ? (
              <button type="button" className="cta" onClick={() => setIndex(index + 1)}>
                {t('practice.next')}
                <Icon name="next" className="sm" />
              </button>
            ) : (
              <MoreButton label={t('practice.more')} loading={bucket.loading} exhausted={bucket.exhausted} errorKey={bucket.errorKey} onClick={() => {
                const next = items.length;
                void loadMore(pkg.topic.key, conceptKey, 'quiz', lang).then(() => setIndex(next));
              }} />
            )}
            {index > 0 && (
              <button type="button" className="btn2" onClick={() => setIndex(index - 1)}>
                <Icon name="prev" className="sm" />
                {t('practice.prev')}
              </button>
            )}
            <FeedbackButtons id={q.id} />
          </div>
        </div>
      )}
    </section>
  );
}
