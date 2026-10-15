/**
 * Structures of the scene as an accessible tree (§10 «структуры сцены доступны
 * деревом»): containers (membrane, wall, crystal…) are parents of the inner
 * structures. Arrow keys move, Enter/Space selects — a full keyboard
 * alternative to clicking the 3D model (also answers «find on model»).
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr, type ResolvedConcept } from '@bilig/content-model';
import { useLang } from '../lib/hooks';
import { useViewer } from '../state/viewer';
import { useTopic } from './context';

export function StructureTree(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { concepts } = useTopic();
  const selected = useViewer((s) => s.selected);
  const pick = useViewer((s) => s.pick);
  const finding = useViewer((s) => !!s.findItemKey);
  const containers = concepts.filter((c) => c.isContainer);
  const inner = concepts.filter((c) => !c.isContainer);
  // Flat order for keyboard navigation (parents first, then their children).
  const order: ResolvedConcept[] = containers.length ? [...containers.slice(0, 1), ...inner, ...containers.slice(1)] : inner;
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

  const item = (c: ResolvedConcept, children?: ResolvedConcept[]) => {
    const i = order.indexOf(c);
    return (
      <li
        key={c.key}
        role="treeitem"
        aria-selected={selected === c.key}
        aria-expanded={children ? true : undefined}
        tabIndex={i === active ? 0 : -1}
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
        style={children ? { display: 'block' } : undefined}
      >
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span className="dot" style={{ background: `hsl(${c.hue} 70% 58%)` }} />
          {tr(c.title, lang)}
        </span>
        {children && children.length > 0 && (
          <ul role="group" className="tree__group">
            {children.map((ch) => item(ch))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section className="card" aria-labelledby="tree-title">
      <h2 id="tree-title" className="panel-title">
        {t('scene.structures')}
      </h2>
      {finding && <p className="badge badge--accent">{t('quiz.findHint')}</p>}
      <ul role="tree" aria-labelledby="tree-title" className="tree">
        {containers.length ? (
          <>
            {item(containers[0], inner)}
            {containers.slice(1).map((c) => item(c))}
          </>
        ) : (
          inner.map((c) => item(c))
        )}
      </ul>
    </section>
  );
}
