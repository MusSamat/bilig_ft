/**
 * Selection toolbar (contract 0.4.0), the pattern of Medium / Kindle / Google
 * Docs «Ask Gemini»: select learning text and a small toolbar offers
 * «Объясни», «Проще», «Пример» (ask the assistant with the selection as a
 * quote), «Перевести» (offline, from the topic glossary) and «Спросить…»
 * (attach the quote to a question the teacher types).
 *
 * Only text inside `[data-ask]` regions counts (the concept card, processes,
 * lessons, examples, assistant answers), so it never pops up over controls.
 * Above the selection on desktop; a bottom bar on touch screens, where the
 * system's own copy menu sits next to the selection. The toolbar never takes
 * the selection away (pointerdown is cancelled); Esc dismisses it.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { glossaryMatches } from '@bilig/content-model';
import { QUOTE_MAX, QUOTE_SOURCES, type QuoteSource, type TutorIntent } from '@bilig/content-model/api';
import { usePermission } from '../api/session';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { askAssistant, attachQuote, type Quote } from './assistantBus';
import { useTopic } from './context';

/** Collapse whitespace and cut at a word boundary to the contract's quote limit. */
export function clampQuote(raw: string, max = QUOTE_MAX): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${sp > max * 0.6 ? cut.slice(0, sp) : cut}…`;
}

export interface PageSelection {
  quote: Quote;
  rect: { top: number; bottom: number; left: number; width: number };
}

const elementOf = (n: Node | null): Element | null => (n instanceof Element ? n : n?.parentElement ?? null);

/** The current selection when it lies inside one `[data-ask]` region (and not in a form field). */
export function readSelection(doc: Document = document): PageSelection | null {
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const root = elementOf(range.commonAncestorContainer)?.closest<HTMLElement>('[data-ask]');
  if (!root || root.closest('input, textarea, [contenteditable="true"]')) return null;
  const text = clampQuote(sel.toString());
  if (text.length < 2) return null;
  const src = root.dataset.ask as QuoteSource;
  // (jsdom has no Range geometry.)
  const r = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : { top: 0, bottom: 0, left: 0, width: 0 };
  return {
    quote: { text, source: (QUOTE_SOURCES as readonly string[]).includes(src) ? src : 'topic', ...(root.dataset.concept ? { conceptKey: root.dataset.concept } : {}) },
    rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
  };
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function SelectionMenu(): JSX.Element | null {
  const { t } = useTranslation();
  const lang = useLang();
  const { pkg } = useTopic();
  const canAsk = usePermission('assistant.ask.online');
  const [sel, setSel] = useState<PageSelection | null>(null);
  const [glossary, setGlossary] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSel(readSelection()));
    };
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => setGlossary(false), [sel?.quote.text]);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      document.getSelection()?.removeAllRanges();
      setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  if (!sel) return null;
  const { quote, rect } = sel;
  const done = () => {
    document.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const quick = (intent: Exclude<TutorIntent, 'ask'>) => {
    askAssistant({ question: t(`select.q.${intent}`, { quote: short(quote.text) }), intent, quote });
    done();
  };

  const sheet = coarse();
  const below = rect.top < 96;
  const x = Math.min(Math.max(rect.left + rect.width / 2, 160), (typeof innerWidth === 'number' ? innerWidth : 1024) - 160);
  const style: CSSProperties | undefined = sheet ? undefined : { left: x, top: below ? rect.bottom + 10 : rect.top - 10 };
  const terms = glossary ? glossaryMatches(pkg, quote.text) : [];

  return (
    <div
      className={`selmenu glass${sheet ? ' selmenu--sheet' : below ? ' selmenu--below' : ''}`}
      style={style}
      role="toolbar"
      aria-label={t('select.label')}
      // Keep the page selection while the toolbar is used.
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="selmenu__row">
        {canAsk && (
          <>
            <button type="button" onClick={() => quick('explain')}>
              <Icon name="help" className="sm" />
              {t('select.explain')}
            </button>
            <button type="button" onClick={() => quick('simpler')}>
              <Icon name="bulb" className="sm" />
              {t('select.simpler')}
            </button>
            <button type="button" onClick={() => quick('example')}>
              <Icon name="target" className="sm" />
              {t('select.example')}
            </button>
          </>
        )}
        <button type="button" aria-pressed={glossary} onClick={() => setGlossary((v) => !v)}>
          <Icon name="translate" className="sm" />
          {t('select.translate')}
        </button>
        {canAsk && (
          <button
            type="button"
            onClick={() => {
              attachQuote(quote);
              done();
            }}
          >
            <Icon name="chat" className="sm" />
            {t('select.ask')}
          </button>
        )}
      </div>
      {glossary && (
        <div className="selmenu__gloss" role="status">
          {terms.length ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('select.lang.ky')}</th>
                  <th scope="col">{t('select.lang.ru')}</th>
                  <th scope="col">{t('select.lang.en')}</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((g) => (
                  <tr key={g.id}>
                    <td lang="ky" className={lang === 'ky' ? 'is-cur' : undefined}>{g.ky}</td>
                    <td lang="ru" className={lang === 'ru' ? 'is-cur' : undefined}>{g.ru}</td>
                    <td lang="en" className={lang === 'en' ? 'is-cur' : undefined}>{g.en}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{t('select.noGlossary')}</p>
          )}
        </div>
      )}
    </div>
  );
}
