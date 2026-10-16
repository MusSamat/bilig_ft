/**
 * Assistant (W-32): greeting, message history, suggestion chips
 * («Что делает… / Где находится… / Какого размера…»), input, streaming answer
 * with concept citations that highlight the structure in 3D. When the service
 * is unavailable (503 / no network) a localized message is shown.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { isApiError } from '../api/client';
import { usePermission, useSession } from '../api/session';
import { askTutor } from '../api/tutor';
import { Icon } from '../components/Icon';
import { GUEST_TUTOR_LIMIT } from '../config';
import { conceptColor } from '@bilig/scene-core';
import { useLang, useOnline } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useAssistantBus } from './assistantBus';
import { useTopic } from './context';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  cites: string[];
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

export function AssistantPanel(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg, concepts } = useTopic();
  const allowed = usePermission('assistant.ask.online');
  const isGuest = useSession((s) => s.status !== 'authed');
  const selected = useViewer((s) => s.selected);
  const setCited = useViewer((s) => s.setCited);
  const pick = useViewer((s) => s.pick);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const pending = useAssistantBus((s) => s.pending);
  const nonce = useAssistantBus((s) => s.nonce);

  useEffect(() => setMsgs([]), [pkg.topic.key]);
  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [msgs]);

  const ask = async (question: string) => {
    const q = question.trim();
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
    setMsgs((m) => [...m, { role: 'user', text: q, cites: [] }, { role: 'assistant', text: '', cites: [] }]);
    setInput('');
    setBusy(true);
    const cur: Msg = { role: 'assistant', text: '', cites: [] };
    const flush = () => setMsgs((all) => [...all.slice(0, -1), { ...cur, cites: [...cur.cites] }]);
    try {
      await askTutor({ topicKey: pkg.topic.key, question: q, lang, ...(selected ? { conceptKey: selected } : {}), history }, (ev) => {
        if (ev.type === 'token') cur.text += ev.text;
        else if (ev.type === 'citation' && !cur.cites.includes(ev.conceptKey)) cur.cites.push(ev.conceptKey);
        else if (ev.type === 'error') cur.errorKey = ev.i18nKey;
        flush();
      });
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

  // «Спросить помощника» from the concept card.
  useEffect(() => {
    if (!pending) return;
    useAssistantBus.setState({ pending: null });
    inputRef.current?.focus();
    void ask(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (!allowed) return null;
  const focus = concepts.find((c) => c.key === selected) ?? concepts.find((c) => !c.isContainer);
  const name = focus ? tr(focus.title, lang) : '';
  const suggestions = focus ? [t('assistant.suggest.what', { name }), t('assistant.suggest.where', { name }), t('assistant.suggest.size', { name })] : [];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const unavailable = msgs.some((m, i) => i === msgs.length - 1 && m.errorKey === 'errors.tutor_unavailable') || !online;

  return (
    <section id="tutor" className="tutor panel glass" aria-labelledby="assistant-title">
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
      <div className="msgs" ref={logRef} role="log" aria-live="polite" aria-label={t('assistant.history')}>
        <p className="m b">{t('assistant.greeting', { topic: tr(pkg.topic.title, lang) })}</p>
        {msgs.map((m, i) => (
          <div key={i} className={`m ${m.role === 'user' ? 'u' : 'b'}${m.errorKey ? ' m--err' : ''}`}>
            <span className="visually-hidden">{m.role === 'user' ? t('assistant.you') : t('assistant.bot')}: </span>
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
      {suggestions.length > 0 && (
        <div className="prompts" role="group" aria-label={t('assistant.suggestions')}>
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => void ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form className="ask" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('assistant.placeholder')}
          aria-label={t('assistant.inputLabel')}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label={t('assistant.send')} title={input.trim() ? t('assistant.send') : t('assistant.typeFirst')}>
          <Icon name="send" />
        </button>
      </form>
    </section>
  );
}
