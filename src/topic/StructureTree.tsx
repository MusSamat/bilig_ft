/**
 * Structure chips overlaid on the stage (Workbench #chips) — and the scene's
 * accessible tree (§10 «структуры сцены доступны деревом»): every structure
 * is a treeitem chip with its colour dot, so pupils see what to click and
 * keyboard / screen-reader users get the same list. Arrow keys move,
 * Home/End jump, Enter/Space selects (also answers «find on model»).
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { conceptColor } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

export function StructureTree(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { concepts } = useTopic();
  const selected = useViewer((s) => s.selected);
  const pick = useViewer((s) => s.pick);
  const setHovered = useViewer((s) => s.setHovered);
  const finding = useViewer((s) => !!s.findItemKey);
  const order = concepts;
  const [active, setActive] = useState(() => Math.max(0, order.findIndex((c) => c.key === selected)));
  const refs = useRef(new Map<string, HTMLLIElement>());

  const focusAt = (i: number) => {
    const n = (i + order.length) % order.length;
    setActive(n);
    refs.current.get(order[n].key)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') focusAt(i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') focusAt(i - 1);
    else if (e.key === 'Home') focusAt(0);
    else if (e.key === 'End') focusAt(order.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(order[i].key);
    else return;
    e.preventDefault();
  };

  return (
    <div className="chips-wrap">
      <h3 id="tree-title" className="visually-hidden">
        {t('scene.structures')}
      </h3>
      {finding && (
        <p className="pill find-pill" role="status">
          {t('quiz.findHint')}
        </p>
      )}
      <ul role="tree" aria-labelledby="tree-title" className="chips stage-chips">
        {order.map((c, i) => (
          <li
            key={c.key}
            role="treeitem"
            aria-selected={selected === c.key}
            aria-level={1}
            tabIndex={i === active ? 0 : -1}
            className="chip"
            ref={(el) => {
              if (el) refs.current.set(c.key, el);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              onKey(e, i);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setActive(i);
              pick(c.key);
            }}
            onPointerEnter={() => setHovered(c.key)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(c.key)}
            onBlur={() => setHovered(null)}
          >
            <i className="dot" style={{ background: conceptColor(c.hue) }} aria-hidden="true" />
            {tr(c.title, lang)}
          </li>
        ))}
      </ul>
    </div>
  );
}
