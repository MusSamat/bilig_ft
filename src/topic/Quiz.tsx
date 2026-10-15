/**
 * «Проверь себя» (W-45): numbered questions of all five item types (single,
 * multiple, match, find-on-model by clicking the 3D model or the structure
 * tree, numeric), immediate check with a verdict icon and explanation, score,
 * retake. Items are drawn with the contract's deterministic `sampleItems`
 * (seed = attempt clientId). Signed-in learners with `quiz.attempt.save`
 * also record the attempt on the server (POST /attempts → answers → finish).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  checkAnswer,
  sampleItems,
  seededShuffle,
  t as tr,
  type CheckResult,
  type Item,
  type ItemResponse,
} from '@bilig/content-model';
import { api } from '../api/client';
import { usePermission } from '../api/session';
import { Icon } from '../components/Icon';
import { uuid } from '../lib/db';
import { useLang } from '../lib/hooks';
import { toast } from '../state/ui';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

type Draft = { [itemKey: string]: ItemResponse | undefined };

/** Parse a numeric answer typed with a comma or a dot (ky/ru use a decimal comma). */
export const parseNumber = (s: string): number => (s.trim() ? Number(s.trim().replace(/\s/g, '').replace(',', '.')) : Number.NaN);

export function Quiz({ ready }: { ready: boolean }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, progress, assignmentId } = useTopic();
  const canSave = usePermission('quiz.attempt.save');
  const spec = pkg.topic.activities.quiz;
  const [attempt, setAttempt] = useState<{ clientId: string; serverId?: string; startedAt: number } | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const findAnswer = useViewer((s) => s.findAnswer);
  const findItemKey = useViewer((s) => s.findItemKey);
  const setFindItem = useViewer((s) => s.setFindItem);

  const items: Item[] = useMemo(() => {
    if (!spec || !attempt) return [];
    const pool = spec.itemKeys.map((k) => pkg.items.find((i) => i.key === k)).filter((i): i is Item => !!i);
    return sampleItems(pool, spec.sampleSize, attempt.clientId);
  }, [spec, pkg.items, attempt]);

  // «Найди на модели»: a pick on the model/tree becomes the response.
  useEffect(() => {
    if (findAnswer) setDraft((d) => ({ ...d, [findAnswer.itemKey]: { type: 'find-on-model', value: findAnswer.conceptKey } }));
  }, [findAnswer]);
  useEffect(() => () => setFindItem(null), [setFindItem]);

  if (!spec) return <p className="muted">{t('quiz.empty')}</p>;

  const start = async () => {
    const clientId = uuid();
    setDraft({});
    setResults({});
    setAttempt({ clientId, startedAt: Date.now() });
    if (canSave) {
      try {
        const a = await api('attemptCreate', { body: { clientId, topicKey: pkg.topic.key, topicVersion: pkg.manifest.version, seed: clientId, ...(assignmentId ? { assignmentId } : {}) } });
        setAttempt({ clientId, serverId: a.id, startedAt: Date.now() });
      } catch {
        toast({ key: 'quiz.saveFailed', kind: 'error' });
      }
    }
  };

  const check = (item: Item) => {
    const response = draft[item.key];
    if (!response) return;
    const res = checkAnswer(item, response);
    setResults((r) => ({ ...r, [item.key]: res }));
    if (attempt?.serverId) {
      void api('attemptAnswer', { params: { id: attempt.serverId }, body: { itemKey: item.key, response, timeMs: Date.now() - attempt.startedAt } }).catch(() => undefined);
    }
  };

  const done = items.length > 0 && items.every((i) => results[i.key]);
  const correct = items.filter((i) => results[i.key]?.correct).length;

  const finish = async () => {
    progress.complete('quiz');
    if (attempt?.serverId) {
      try {
        await api('attemptFinish', { params: { id: attempt.serverId }, body: {} });
        toast({ key: 'quiz.saved', kind: 'success' });
      } catch {
        toast({ key: 'quiz.saveFailed', kind: 'error' });
      }
    }
  };

  if (!attempt) {
    return (
      <div className="quiz">
        <p>{t('quiz.intro', { count: spec.sampleSize })}</p>
        {!canSave && <p className="muted small">{t('quiz.guestNote')}</p>}
        <div>
          <button type="button" className="btn btn--primary" onClick={() => void start()} disabled={!ready}>
            {t('quiz.start')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz">
      <ol>
        {items.map((item, idx) => {
          const res = results[item.key];
          const response = draft[item.key];
          const set = (r: ItemResponse) => !res && setDraft((d) => ({ ...d, [item.key]: r }));
          return (
            <li key={item.key} className="question" data-testid={`question-${item.type}`}>
              <fieldset disabled={!!res}>
                <legend>
                  <span className="muted small">{t('quiz.question', { n: idx + 1, m: items.length })}</span>
                  <br />
                  {tr(item.prompt, lang)}
                </legend>
                <ItemInput item={item} response={response} onChange={set} seed={attempt.clientId} finding={findItemKey === item.key} onFind={() => setFindItem(findItemKey === item.key ? null : item.key)} />
              </fieldset>
              {!res ? (
                <div>
                  <button type="button" className="btn btn--sm btn--primary" disabled={!isComplete(item, response)} onClick={() => check(item)}>
                    {t('quiz.check')}
                  </button>
                </div>
              ) : (
                <div role="status">
                  <p className={`verdict ${res.correct ? 'verdict--ok' : 'verdict--bad'}`}>
                    <Icon name={res.correct ? 'check' : 'x'} />
                    {res.correct ? t('quiz.correct') : res.score > 0 ? t('quiz.partial') : t('quiz.incorrect')}
                  </p>
                  <p>
                    <b>{t('quiz.explanation')}:</b> {tr(item.explanation, lang)}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {done && (
        <div className="row" role="status">
          <span className="score">{t('quiz.score', { correct, total: items.length })}</span>
          <button type="button" className="btn btn--primary" onClick={() => void finish()}>
            {t('quiz.finish')}
          </button>
          <button type="button" className="btn" onClick={() => void start()}>
            <Icon name="reset" />
            {t('quiz.retake')}
          </button>
        </div>
      )}
    </div>
  );
}

function isComplete(item: Item, r: ItemResponse | undefined): boolean {
  if (!r) return false;
  switch (item.type) {
    case 'multiple':
      return (r.value as string[]).length > 0;
    case 'match':
      return item.pairs.every((p) => (r.value as Record<string, string>)[p.key]);
    case 'numeric':
      return Number.isFinite(r.value as number);
    default:
      return !!r.value;
  }
}

function ItemInput(props: { item: Item; response: ItemResponse | undefined; onChange(r: ItemResponse): void; seed: string; finding: boolean; onFind(): void }): JSX.Element {
  const { item, response, onChange, seed, finding, onFind } = props;
  const { t } = useTranslation();
  const lang = useLang();
  const { concepts } = useTopic();
  const name = `q-${item.key}`;
  switch (item.type) {
    case 'single':
      return (
        <>
          {item.options.map((o) => (
            <label key={o.key} className="option">
              <input type="radio" name={name} checked={response?.value === o.key} onChange={() => onChange({ type: 'single', value: o.key })} />
              {tr(o.text, lang)}
            </label>
          ))}
        </>
      );
    case 'multiple': {
      const cur = (response?.value as string[] | undefined) ?? [];
      return (
        <>
          {item.options.map((o) => (
            <label key={o.key} className="option">
              <input
                type="checkbox"
                checked={cur.includes(o.key)}
                onChange={(e) => onChange({ type: 'multiple', value: e.target.checked ? [...cur, o.key] : cur.filter((k) => k !== o.key) })}
              />
              {tr(o.text, lang)}
            </label>
          ))}
        </>
      );
    }
    case 'match': {
      const cur = (response?.value as Record<string, string> | undefined) ?? {};
      const rights = seededShuffle(item.pairs, `${seed}:${item.key}`);
      return (
        <>
          {item.pairs.map((p) => (
            <div key={p.key} className="match-row">
              <span>{tr(p.left, lang)}</span>
              <select
                className="input"
                value={cur[p.key] ?? ''}
                aria-label={t('quiz.matchFor', { left: tr(p.left, lang) })}
                onChange={(e) => onChange({ type: 'match', value: { ...cur, [p.key]: e.target.value } })}
              >
                <option value="">{t('quiz.matchChoose')}</option>
                {rights.map((r) => (
                  <option key={r.key} value={r.key}>
                    {tr(r.right, lang)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </>
      );
    }
    case 'find-on-model': {
      const picked = concepts.find((c) => c.key === response?.value);
      return (
        <div className="row">
          <button type="button" className="btn btn--sm" aria-pressed={finding} onClick={onFind}>
            <Icon name="focus" size={18} />
            {t('quiz.findPick')}
          </button>
          {finding && <span className="muted small">{t('quiz.findHint')}</span>}
          {picked && <span>{t('quiz.findPicked', { name: tr(picked.title, lang) })}</span>}
        </div>
      );
    }
    case 'numeric':
      return (
        <label className="field">
          <span>{t('quiz.numericLabel')}</span>
          <input
            className="input"
            inputMode="decimal"
            onChange={(e) => onChange({ type: 'numeric', value: parseNumber(e.target.value) })}
            style={{ maxWidth: 200 }}
          />
          {item.unit && <span className="muted small">{t('quiz.unit', { unit: item.unit })}</span>}
        </label>
      );
  }
}
