/**
 * «ИИ-контент» (contract 0.4.0): the review queue for AI-generated examples
 * and practice questions that teachers were shown. Editors see each item
 * with its topic, how often it was served and how teachers rated it, and:
 *  - approve it (served first, marked «Проверено» for teachers);
 *  - dismiss it (never served again);
 *  - move it into the content: a question opens the item-bank editor
 *    prefilled, an example opens its concept with the example appended, as a
 *    local draft — translation and publishing then follow the usual workflow.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminGenerated, EndpointResponse } from '@bilig/content-model/api';
import { LANGS, type Item, type Lang, type Localized } from '@bilig/content-model';
import { useApiMutation, useCanCall } from '../api/hooks';
import { api } from '../api/session';
import { useAdminLang, useT } from '../i18n';
import { writeDraft } from '../lib/draft';
import { Icon } from '../lib/icons';
import { ListView, type Column } from '../lists/ListView';
import { useListParams } from '../lists/useListParams';
import { useAdminPath } from '../shell/base';
import { Badge, ErrorBox, FilterSelect, FilterText, PageHeader, fmtDate, fmtNum, type Tone } from '../shell/ui';
import { navIcon } from '../shell/Layout';

const FILTERS = ['status', 'kind', 'topicKey', 'reported'];
const STATUS_TONE: Record<AdminGenerated['status'], Tone> = { new: 'info', approved: 'ok', dismissed: 'archived', promoted: 'neutral' };

/** One language filled, the others empty: the editor's validation asks for the translations. */
const only = (lang: Lang, text: string): Localized => Object.fromEntries(LANGS.map((l) => [l, l === lang ? text : ''])) as Localized;

/** Item-bank draft from a generated question (single choice). */
export function itemDraft(g: AdminGenerated): Item {
  const q = g.quiz!;
  return {
    key: `${(g.conceptKey ?? g.topicKey).replace(/[^a-z0-9.]+/g, '-')}.gen-${g.id.slice(-6)}`,
    type: 'single',
    prompt: only(g.lang, q.prompt),
    explanation: only(g.lang, q.explanation),
    objectiveKeys: [],
    difficulty: 2,
    options: q.options.map((o) => ({ key: o.key, text: only(g.lang, o.text) })),
    answer: q.answer,
  };
}

export function Generated() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const list = useListParams(FILTERS);
  const nav = useNavigate();
  const to = useAdminPath();
  const canPatch = useCanCall('adminGeneratedPatch');
  const canItems = useCanCall('adminItemCreate');
  const canConcepts = useCanCall('adminConceptPatch');
  const patch = useApiMutation('adminGeneratedPatch', ['adminGeneratedList']);
  const [error, setError] = useState<unknown>(null);

  const setStatus = async (g: AdminGenerated, status: AdminGenerated['status'], promotedTo?: string) => {
    setError(null);
    try {
      await patch.mutateAsync({ params: { id: g.id }, body: { status, ...(promotedTo ? { promotedTo } : {}) } });
    } catch (e) {
      setError(e);
    }
  };

  /** Copy into the content editors as a local draft, record the promotion, open the editor. */
  const promote = async (g: AdminGenerated) => {
    setError(null);
    try {
      if (g.quiz) {
        const draft = itemDraft(g);
        writeDraft('items:new', draft, null);
        await setStatus(g, 'promoted', `item:${draft.key}`);
        nav(to('items/new'));
      } else if (g.example && g.conceptKey) {
        const rec = (await api.call('adminConceptGet', { params: { key: g.conceptKey } })) as EndpointResponse<'adminConceptGet'>;
        const kind = g.kind === 'stem' ? 'stem' : 'simple';
        const ex = { title: only(g.lang, g.example.title), text: only(g.lang, g.example.text), ...(g.example.field ? { field: g.example.field } : {}) };
        const data = { ...rec.data, examples: { ...rec.data.examples, [kind]: [...rec.data.examples[kind], ex] } };
        writeDraft(`concepts:${g.conceptKey}`, data, rec.version);
        await setStatus(g, 'promoted', `concept:${g.conceptKey}`);
        nav(to(`concepts/${encodeURIComponent(g.conceptKey)}`));
      }
    } catch (e) {
      setError(e);
    }
  };

  const columns = useMemo<Column<AdminGenerated>[]>(
    () => [
      {
        key: 'content',
        header: t('generated.content'),
        render: (g) => (
          <div className="adm-gen">
            <span className="adm-muted">
              {t(`generated.kind.${g.kind}`)} · {g.lang.toUpperCase()}
            </span>
            {g.quiz ? (
              <>
                <b>{g.quiz.prompt}</b>
                <ol className="adm-gen__opts">
                  {g.quiz.options.map((o) => (
                    <li key={o.key} className={o.key === g.quiz!.answer ? 'is-answer' : undefined}>
                      {o.text}
                      {o.key === g.quiz!.answer && <Icon id="check" size={14} />}
                    </li>
                  ))}
                </ol>
                <span className="adm-muted">{g.quiz.explanation}</span>
              </>
            ) : (
              <>
                <b>{g.example?.title}</b>
                <span>{g.example?.text}</span>
              </>
            )}
          </div>
        ),
      },
      { key: 'topicKey', header: t('generated.where'), render: (g) => <code>{g.conceptKey ? `${g.topicKey} / ${g.conceptKey}` : g.topicKey}</code>, sortValue: (g) => g.topicKey },
      {
        key: 'bad',
        header: t('generated.rating'),
        render: (g) => (
          <span className="adm-gen__rating">
            <span title={t('generated.good')}>+{fmtNum(g.good, lang)}</span>
            <span title={t('generated.bad')} className={g.bad ? 'is-bad' : undefined}>
              −{fmtNum(g.bad, lang)}
            </span>
            {Object.entries(g.reasons).map(([r, n]) => (
              <Badge key={r} tone="warn">
                {t(`generated.reason.${r}`)} × {n}
              </Badge>
            ))}
          </span>
        ),
        sortValue: (g) => g.bad,
        sortField: 'bad',
      },
      { key: 'served', header: t('generated.served'), render: (g) => fmtNum(g.served, lang), sortValue: (g) => g.served, sortField: 'served' },
      { key: 'status', header: t('generated.statusLabel'), render: (g) => <Badge tone={STATUS_TONE[g.status]}>{t(`generated.status.${g.status}`)}</Badge>, sortValue: (g) => g.status },
      { key: 'createdAt', header: t('generated.createdAt'), render: (g) => fmtDate(g.createdAt, lang), sortValue: (g) => g.createdAt, sortField: 'createdAt' },
      {
        key: 'actions',
        header: <span className="visually-hidden">{t('generated.actions')}</span>,
        render: (g) =>
          canPatch ? (
            <span className="adm-row-actions">
              {g.status !== 'approved' && g.status !== 'promoted' && (
                <button type="button" className="adm-btn adm-btn--small" onClick={(e) => { e.stopPropagation(); void setStatus(g, 'approved'); }}>
                  <Icon id="check" size={16} />
                  {t('generated.approve')}
                </button>
              )}
              {g.status !== 'promoted' && ((g.quiz && canItems) || (g.example && g.conceptKey && canConcepts)) && (
                <button type="button" className="adm-btn adm-btn--small" onClick={(e) => { e.stopPropagation(); void promote(g); }} title={t('generated.promoteHint')}>
                  <Icon id="next" size={16} />
                  {t('generated.promote')}
                </button>
              )}
              {g.status !== 'dismissed' && g.status !== 'promoted' && (
                <button type="button" className="adm-btn adm-btn--small adm-btn--ghost" onClick={(e) => { e.stopPropagation(); void setStatus(g, 'dismissed'); }}>
                  {t('generated.dismiss')}
                </button>
              )}
              {g.status !== 'new' && (
                <button type="button" className="adm-btn adm-btn--small adm-btn--ghost" onClick={(e) => { e.stopPropagation(); void setStatus(g, 'new'); }}>
                  {t('generated.reopen')}
                </button>
              )}
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, lang, canPatch, canItems, canConcepts],
  );

  const opts = (prefix: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));
  return (
    <section>
      <PageHeader title={t('nav.generated')} icon={navIcon('generated')} description={t('pages.generated')} />
      <div className="adm-filters">
        <FilterSelect label={t('generated.statusLabel')} value={list.filters.status} options={opts('generated.status', ['new', 'approved', 'dismissed', 'promoted'])} onApply={(v) => list.setFilter('status', v)} />
        <FilterSelect label={t('generated.kindLabel')} value={list.filters.kind} options={opts('generated.kind', ['simple', 'stem', 'quiz'])} onApply={(v) => list.setFilter('kind', v)} />
        <FilterSelect label={t('generated.reported')} value={list.filters.reported} options={[{ value: 'true', label: t('generated.reportedYes') }, { value: 'false', label: t('generated.reportedNo') }]} onApply={(v) => list.setFilter('reported', v)} />
        <FilterText label={t('generated.topic')} value={list.filters.topicKey} onApply={(v) => list.setFilter('topicKey', v)} />
      </div>
      <ErrorBox error={error} />
      <ListView endpoint="adminGeneratedList" list={list} columns={columns} rowKey={(g: AdminGenerated) => g.id} />
      <p className="adm-hint">{t('generated.hint')}</p>
    </section>
  );
}
