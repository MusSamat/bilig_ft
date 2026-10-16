/**
 * Assistant (W-32, contract 0.4.0): greeting, message history, follow-up
 * chips about what is on screen, input, streaming answer with concept
 * citations that highlight the structure in 3D. When the service is
 * unavailable (503 / no network) a localized message is shown.
 *
 * Everything is scoped to the topic «под капотом»: each question carries the
 * context envelope (focus concept, process step, sample, an attached quote),
 * the input shows what the assistant is looking at as a removable chip, and an
 * off-topic answer comes back with questions that lead back to the topic.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestQuestions, t as tr } from '@bilig/content-model';
import { isApiError } from '../api/client';
import { usePermission, useSession } from '../api/session';
import { askTutor } from '../api/tutor';
import { Icon } from '../components/Icon';
import { GUEST_TUTOR_LIMIT } from '../config';
import { conceptColor } from '@bilig/scene-core';
import { useLang, useOnline } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { clearQuote, useAssistantBus, type AskRequest } from './assistantBus';
import { useTopic } from './context';
import { useTutorContext } from './tutorContext';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  cites: string[];
  /** The selection the question was about (shown above the question). */
  quote?: string;
  /** Follow-up questions the server sent after an off-topic question. */
  suggestions?: string[];
  errorKey?: string;
}

const GUEST_KEY = 'bilig.guestQuestions';
const guestCount = (): number => {
  try {
    return Number(sessionStorage.getItem(GUEST_KEY) ?? 0);
  } catch {
    return 0;
  }
};

/** `controls`: the floating dock's buttons (size / minimise), shown in the header. */
export function AssistantPanel({ controls }: { controls?: ReactNode } = {}): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const allowed = usePermission('assistant.ask.online');
  const isGuest = useSession((s) => s.status !== 'authed');
  const selected = useViewer((s) => s.selected);
  const process = useViewer((s) => s.process);
  const setCited = useViewer((s) => s.setCited);
  const pick = useViewer((s) => s.pick);
  const context = useTutorContext();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // «×» on the focus chip: ask about the whole topic until the selection changes.
  const [topicWide, setTopicWide] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const pending = useAssistantBus((s) => s.pending);
  const nonce = useAssistantBus((s) => s.nonce);
  const quote = useAssistantBus((s) => s.quote);

  useEffect(() => setMsgs([]), [pkg.topic.key]);
  useEffect(() => setTopicWide(false), [selected]);
  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [msgs]);

  const focus = topicWide ? undefined : concepts.find((c) => c.key === selected);

  const ask = async (req: AskRequest) => {
    const q = req.question.trim();
    if (!q || busy) return;
    if (isGuest && guestCount() >= GUEST_TUTOR_LIMIT) {
      setMsgs((m) => [...m, { role: 'user', text: q, cites: [] }, { role: 'assistant', text: '', cites: [], errorKey: 'assistant.limit' }]);
      return;
    }
    try {
      sessionStorage.setItem(GUEST_KEY, String(guestCount() + 1));
    } catch {
      /* ignore */
    }
    const history = msgs.filter((m) => !m.errorKey && m.text).slice(-10).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: 'user', text: q, cites: [], ...(req.quote ? { quote: req.quote.text } : {}) }, { role: 'assistant', text: '', cites: [] }]);
    setInput('');
    setBusy(true);
    const cur: Msg = { role: 'assistant', text: '', cites: [] };
    const flush = () => setMsgs((all) => [...all.slice(0, -1), { ...cur, cites: [...cur.cites] }]);
    const conceptKey = focus?.key ?? req.quote?.conceptKey;
    try {
      await askTutor(
        {
          topicKey: pkg.topic.key,
          question: q,
          lang,
          ...(conceptKey ? { conceptKey } : {}),
          history,
          context: { ...context, ...(req.quote ? { quote: req.quote } : {}) },
          ...(req.intent ? { intent: req.intent } : {}),
        },
        (ev) => {
          if (ev.type === 'token') cur.text += ev.text;
          else if (ev.type === 'citation' && !cur.cites.includes(ev.conceptKey)) cur.cites.push(ev.conceptKey);
          else if (ev.type === 'suggestions') cur.suggestions = ev.items;
          else if (ev.type === 'error') cur.errorKey = ev.i18nKey;
          flush();
        },
      );
      if (!cur.text && !cur.errorKey) cur.errorKey = 'assistant.noAnswer';
      flush();
      // W-32 «Ответ выделяет структуру в 3D».
      if (cur.cites[0]) pick(cur.cites[0]);
      setCited(cur.cites);
    } catch (e) {
      const key = isApiError(e) && (e.unavailable || e.code === 'tutor_unavailable') ? 'errors.tutor_unavailable' : isApiError(e) && e.code === 'rate_limited' ? 'errors.rate_limited' : 'errors.tutor_unavailable';
      cur.errorKey = key;
      flush();
    } finally {
      setBusy(false);
    }
  };

  // Questions queued by the concept card and by quick actions on a selection.
  useEffect(() => {
    if (!pending) return;
    useAssistantBus.setState({ pending: null });
    inputRef.current?.focus();
    void ask(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (!allowed) return null;
  const focusName = focus ? tr(focus.title, lang) : '';
  const topicName = tr(pkg.topic.title, lang);
  const suggestions = suggestQuestions(pkg, lang, { conceptKey: focus?.key, processKey: process?.key });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = quote;
    if (q) clearQuote();
    void ask({ question: input, ...(q ? { quote: q } : {}) });
  };

  const unavailable = msgs.some((m, i) => i === msgs.length - 1 && m.errorKey === 'errors.tutor_unavailable') || !online;
  const last = msgs[msgs.length - 1];
  // Follow-ups: the server's after an off-topic answer, else ours; never one already asked.
  const asked = new Set(msgs.filter((m) => m.role === 'user').map((m) => m.text));
  const followUps = (!busy && last?.role === 'assistant' && last.suggestions?.length ? last.suggestions : suggestions).filter((s) => !asked.has(s));

  return (
    <section id="tutor" className="tutor" aria-labelledby="assistant-title">
      <div className="tutor__head">
        <h2 id="assistant-title" className="th2">
          <Icon name="chat" />
          {t('assistant.title')}
          {unavailable && (
            <span className="pill pill--bad">
              <Icon name="wifioff" />
              {t('assistant.unavailable')}
            </span>
          )}
        </h2>
        {controls}
      </div>
      <div className="msgs" ref={logRef} role="log" aria-live="polite" aria-label={t('assistant.history')}>
        <p className="m b">{t('assistant.greeting', { topic: topicName })}</p>
        {msgs.map((m, i) => (
          <div key={i} className={`m ${m.role === 'user' ? 'u' : 'b'}${m.errorKey ? ' m--err' : ''}`} {...(m.role === 'assistant' ? { 'data-ask': 'answer' } : {})}>
            <span className="visually-hidden">{m.role === 'user' ? t('assistant.you') : t('assistant.bot')}: </span>
            {m.quote && <q className="m__quote">{m.quote}</q>}
            {m.errorKey ? (
              <span className="m__err">
                <Icon name="warn" className="sm" />
                {t(m.errorKey)}
              </span>
            ) : (
              m.text || (busy && i === msgs.length - 1 ? <span className="typing">{t('assistant.thinking')}</span> : '')
            )}
            {m.cites.length > 0 && (
              <div className="m__cites">
                {m.cites.map((k) => {
                  const c = concepts.find((x) => x.key === k) ?? pkg.concepts.find((x) => x.key === k);
                  if (!c) return null;
                  return (
                    <button key={k} type="button" className="chip sm" onClick={() => { pick(k); setCited([k]); }} aria-label={`${t('assistant.cited')}: ${tr(c.title, lang)}`}>
                      <i className="dot sm" style={{ background: conceptColor(c.hue) }} aria-hidden="true" />
                      {tr(c.title, lang)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {followUps.length > 0 && (
        <div className="prompts" role="group" aria-label={t('assistant.suggestions')}>
          {followUps.map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => void ask({ question: s })}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="ask-ctx" role="group" aria-label={t('assistant.context')}>
        <span className="ask-ctx__label">{t('assistant.about')}</span>
        <span className="chip sm ask-ctx__chip">{topicName}</span>
        {focus && (
          <span className="chip sm ask-ctx__chip">
            <i className="dot sm" style={{ background: conceptColor(focus.hue) }} aria-hidden="true" />
            {focusName}
            <button type="button" className="ask-ctx__x" onClick={() => setTopicWide(true)} aria-label={t('assistant.dropFocus', { name: focusName })} title={t('assistant.dropFocus', { name: focusName })}>
              <Icon name="x" size={14} />
            </button>
          </span>
        )}
      </div>
      {quote && (
        <div className="ask-quote">
          <q>{quote.text}</q>
          <button type="button" className="ask-ctx__x" onClick={clearQuote} aria-label={t('assistant.dropQuote')} title={t('assistant.dropQuote')}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      <form className="ask" onSubmit={onSubmit}>
        <input
          id="assistant-input"
          ref={inputRef}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          placeholder={quote ? t('assistant.placeholderQuote') : t('assistant.placeholderAbout', { name: focusName || topicName })}
          aria-label={t('assistant.inputLabel')}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label={t('assistant.send')} title={input.trim() ? t('assistant.send') : t('assistant.typeFirst')}>
          <Icon name="send" />
        </button>
      </form>
    </section>
  );
}
