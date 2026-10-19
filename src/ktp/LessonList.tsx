/**
 * The lessons of a КТП grouped by section: a table on wide screens, cards at
 * phone width. Type, date (for the selected class), homework and the linked
 * topic are edited inline; issues show as icons with their localized message.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t as tr } from '@bilig/content-model';
import { KTP_LESSON_TYPES, type KtpIssue, type KtpLessonType, type KtpRow, type KtpRowPatch, type TeachingPlan } from '@bilig/content-model/api';
import { useCatalog } from '../api/content';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/hooks';
import { topicPath } from '../lib/urls';
import { issueParams, isSaturday, rowIssues, type SectionGroup } from './model';
import { TopicPicker } from './TopicPicker';

export interface LessonCtx {
  plan: TeachingPlan;
  cls: string;
  save: (rows: KtpRowPatch[]) => void;
  download: (row: KtpRow) => void;
  busy: string | null;
  range: { from: number; to: number } | null;
  onSelect: (index: number, shift: boolean) => void;
}

/** Localized message of an issue («Несуществующая дата: 31.04.27»). */
export function useIssueText() {
  const { t } = useTranslation();
  return (i: KtpIssue) => t(`ktp.issue.${i.code}`, issueParams(i));
}

export function LessonTable({ groups, ctx }: { groups: SectionGroup[]; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="table-wrap">
      <table className="data-table ktp-table">
        <caption className="visually-hidden">{t('ktp.table.caption', { class: ctx.cls })}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{t('ktp.range.selectCol')}</span>
            </th>
            <th scope="col">{t('ktp.col.index')}</th>
            <th scope="col">{t('ktp.col.title')}</th>
            <th scope="col">{t('ktp.col.type')}</th>
            <th scope="col">{t('ktp.col.hours')}</th>
            <th scope="col">{t('ktp.col.date', { class: ctx.cls })}</th>
            <th scope="col">{t('ktp.col.topic')}</th>
            <th scope="col">{t('ktp.col.homework')}</th>
            <th scope="col" title={t('ktp.col.issues')}>
              <Icon name="warn" className="sm" />
              <span className="visually-hidden">{t('ktp.col.issues')}</span>
            </th>
            <th scope="col">
              <span className="visually-hidden">{t('ktp.col.actions')}</span>
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            <tr className="ktp-sec">
              <th scope="colgroup" colSpan={10}>
                <SectionHead group={g} plan={ctx.plan} />
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.index} id={`ktp-row-${r.index}`} className="ktp-row" data-selected={inRange(ctx, r) || undefined}>
                <td>
                  <SelectBox row={r} ctx={ctx} />
                </td>
                <td className="ktp-num">
                  {r.index}
                  {r.number !== r.index && (
                    <span className="ktp-num__ktp muted" title={t('ktp.col.number')}>
                      № {r.number}
                    </span>
                  )}
                </td>
                <td className="ktp-ltitle">
                  <LessonTitle row={r} />
                </td>
                <td>
                  <TypeSelect row={r} ctx={ctx} />
                </td>
                <td className="ktp-num">{r.hours}</td>
                <td>
                  <DateField row={r} ctx={ctx} />
                </td>
                <td>
                  <TopicCell row={r} ctx={ctx} />
                </td>
                <td>
                  <HomeworkField row={r} ctx={ctx} />
                </td>
                <td>
                  <IssueIcons row={r} ctx={ctx} />
                </td>
                <td>
                  <PlanButton row={r} ctx={ctx} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function LessonCards({ groups, ctx }: { groups: SectionGroup[]; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="ktp-cards" data-testid="ktp-cards">
      {groups.map((g) => (
        <section key={g.key} className="stack" aria-label={g.title ?? t('ktp.section.untitled')}>
          <h3 className="ktp-sec-card">
            <SectionHead group={g} plan={ctx.plan} />
          </h3>
          {g.rows.map((r) => (
            <article key={r.index} id={`ktp-row-${r.index}`} className="ktp-card" data-selected={inRange(ctx, r) || undefined} aria-labelledby={`ktp-card-${r.index}`}>
              <div className="ktp-card__head">
                <SelectBox row={r} ctx={ctx} />
                <span className="ktp-card__n">{r.index}</span>
                <h4 id={`ktp-card-${r.index}`} className="ktp-card__title">
                  <LessonTitle row={r} />
                </h4>
                <IssueIcons row={r} ctx={ctx} />
              </div>
              <div className="ktp-card__grid">
                <DateField row={r} ctx={ctx} />
                <TypeSelect row={r} ctx={ctx} />
              </div>
              <TopicCell row={r} ctx={ctx} />
              <HomeworkField row={r} ctx={ctx} />
              <PlanButton row={r} ctx={ctx} />
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

const inRange = (ctx: LessonCtx, r: KtpRow) => !!ctx.range && r.index >= ctx.range.from && r.index <= ctx.range.to;

function SectionHead({ group, plan }: { group: SectionGroup; plan: TeachingPlan }): JSX.Element {
  const { t } = useTranslation();
  const text = useIssueText();
  const mismatch = plan.issues.find((i) => i.code === 'section_hours_mismatch' && i.row === group.rows[0].index);
  const hours = group.rows.reduce((n, r) => n + r.hours, 0);
  return (
    <span className="ktp-sec__h">
      <b>{group.title ?? t('ktp.section.untitled')}</b>
      <span className="muted small">
        {group.hours !== null ? t('ktp.section.declared', { count: group.hours }) + ' · ' : ''}
        {t('ktp.section.actual', { count: hours })}
      </span>
      {mismatch && (
        <span className="pill ktp-pill--warn">
          <Icon name="warn" className="sm" />
          {text(mismatch)}
        </span>
      )}
    </span>
  );
}

function LessonTitle({ row }: { row: KtpRow }): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      {row.title || <span className="muted">{t('ktp.untitled')}</span>}
      {row.note && <span className="muted small ktp-note">{row.note}</span>}
    </>
  );
}

function SelectBox({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  return (
    <input
      type="checkbox"
      className="ktp-check"
      checked={inRange(ctx, row)}
      aria-label={t('ktp.range.select', { n: row.index })}
      onChange={() => undefined}
      onClick={(e: MouseEvent<HTMLInputElement>) => ctx.onSelect(row.index, e.shiftKey)}
    />
  );
}

function TypeSelect({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  return (
    <select
      className={`input ktp-type ktp-type--${row.type}`}
      value={row.type}
      aria-label={t('ktp.type.label', { n: row.index })}
      onChange={(e) => ctx.save([{ index: row.index, type: e.target.value as KtpLessonType }])}
    >
      {KTP_LESSON_TYPES.map((k) => (
        <option key={k} value={k}>
          {t(`ktp.type.${k}`)}
        </option>
      ))}
    </select>
  );
}

function DateField({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  const text = useIssueText();
  const date = row.dates[ctx.cls] ?? null;
  const issues = rowIssues(ctx.plan.issues, row.index, ctx.cls);
  const invalid = issues.find((i) => i.code === 'date_invalid');
  const badges: { key: string; cls: string; label: string; title: string }[] = [];
  if (invalid)
    badges.push({
      key: 'invalid',
      cls: 'pill--bad',
      label: String(invalid.params?.date ?? '?'),
      title: text(invalid),
    });
  if (isSaturday(date))
    badges.push({
      key: 'sat',
      cls: 'pill--muted',
      label: t('ktp.badge.saturday'),
      title: t('ktp.badge.saturday'),
    });
  for (const i of issues) {
    if (i.code === 'date_sunday')
      badges.push({
        key: 'sun',
        cls: 'pill--bad',
        label: t('ktp.badge.sunday'),
        title: text(i),
      });
    if (i.code === 'date_holiday')
      badges.push({
        key: 'hol',
        cls: 'ktp-pill--warn',
        label: t('ktp.badge.holiday'),
        title: text(i),
      });
  }
  return (
    <div className="ktp-date">
      <input
        type="date"
        className="input"
        value={date ?? ''}
        aria-label={t('ktp.date.label', { n: row.index, class: ctx.cls })}
        aria-invalid={invalid || issues.some((i) => i.code === 'date_missing') ? true : undefined}
        onChange={(e) => {
          const v = e.target.value || null;
          if (v !== date && (v === null || /^\d{4}-\d{2}-\d{2}$/.test(v))) ctx.save([{ index: row.index, dates: { [ctx.cls]: v } }]);
        }}
      />
      {badges.map((b) => (
        <span key={b.key} className={`pill ${b.cls}`} title={b.title}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function HomeworkField({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  const [v, setV] = useState(row.homework);
  useEffect(() => setV(row.homework), [row.homework]);
  const commit = () => {
    if (v.trim() !== row.homework) ctx.save([{ index: row.index, homework: v.trim() }]);
  };
  return (
    <input
      className="input ktp-hw"
      value={v}
      maxLength={1000}
      placeholder={t('ktp.homework.placeholder')}
      aria-label={t('ktp.homework.label', { n: row.index })}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setV(row.homework);
      }}
    />
  );
}

function TopicCell({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: catalog } = useCatalog();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const topic = row.topicKey ? catalog?.topics.find((x) => x.key === row.topicKey) : undefined;
  const title = topic ? tr(topic.title, lang) : row.topicKey;
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };
  return (
    <div className="ktp-topic">
      {row.topicKey ? (
        <>
          <Link className="chip sm" to={topicPath(catalog, lang, row.topicKey)} aria-label={t('ktp.topic.open', { title })}>
            <Icon name="cube" className="sm" />
            {title}
          </Link>
          {row.match?.auto && (
            <span
              className="badge"
              title={t('ktp.topic.autoTitle', {
                score: Math.round(row.match.score * 100),
              })}
            >
              {t('ktp.topic.auto', {
                score: Math.round(row.match.score * 100),
              })}
            </span>
          )}
        </>
      ) : (
        <span className="muted small">{t('ktp.topic.none')}</span>
      )}
      <button
        ref={opener}
        type="button"
        className="icon-btn ktp-topic__edit"
        aria-expanded={open}
        aria-label={t(row.topicKey ? 'ktp.topic.change' : 'ktp.topic.link', {
          n: row.index,
        })}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={row.topicKey ? 'pencil' : 'link'} className="sm" />
      </button>
      {open && (
        <TopicPicker
          lessonTitle={row.title}
          current={row.topicKey}
          subjectKey={ctx.plan.subjectKey}
          onClose={close}
          onPick={(key) => {
            ctx.save([{ index: row.index, topicKey: key }]);
            close();
          }}
        />
      )}
    </div>
  );
}

function IssueIcons({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element | null {
  const text = useIssueText();
  const issues = rowIssues(ctx.plan.issues, row.index, ctx.cls).filter((i) => i.code !== 'section_hours_mismatch');
  if (!issues.length) return null;
  return (
    <span className="ktp-issues">
      {issues.map((i, n) => (
        <span key={n} className={`tip ktp-issue ktp-issue--${i.severity}`} data-tip={text(i)} role="img" aria-label={text(i)} tabIndex={0}>
          <Icon name={i.severity === 'error' ? 'warn' : 'info'} className="sm" />
        </span>
      ))}
    </span>
  );
}

function PlanButton({ row, ctx }: { row: KtpRow; ctx: LessonCtx }): JSX.Element {
  const { t } = useTranslation();
  const key = `row-${row.index}`;
  return (
    <button
      type="button"
      className="btn btn--sm ktp-plan-btn"
      disabled={ctx.busy === key}
      aria-busy={ctx.busy === key}
      aria-label={t('ktp.action.planFor', { n: row.index, class: ctx.cls })}
      onClick={() => ctx.download(row)}
    >
      <Icon name="download" className="sm" />
      {t('ktp.action.plan')}
    </button>
  );
}
