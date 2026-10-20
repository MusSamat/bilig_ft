/**
 * Deletion requests (v0.8.0): a manager asks to delete a teacher or a piece
 * of content with a reason (from its page); SuperAdmin approves with the
 * 2FA code — the server deletes then — or rejects with a note. «Запросы на
 * удаление»: managers see their own requests, SuperAdmin the pending ones.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TotpSchema, type DeletionRequest } from '@bilig/content-model/api';
import { useApiMutation, useApiQuery, useCanCall } from '../api/hooks';
import { useAdminLang, useT } from '../i18n';
import { Icon } from '../lib/icons';
import { useAdminPath } from '../shell/base';
import { toast } from '../shell/toast';
import {
  Chip,
  Empty,
  ErrorLine,
  Field,
  Loading,
  PageTitle,
  Pager,
  ReasonField,
  Sheet,
  Td,
  TotpField,
  btn,
  cx,
  fmtDateTime,
  inputCls,
  tableCls,
  tbodyCls,
  thCls,
  theadCls,
  trCls,
} from './ui';

type Kind = DeletionRequest['kind'];

/** «Запросить удаление» on a teacher or content page (deletion.request). */
export function RequestDeletionButton({ kind, targetId, label, className }: { kind: Kind; targetId: string; label: string; className?: string }) {
  const t = useT();
  const can = useCanCall('deletionCreate');
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <button type="button" className={btn('danger', className)} onClick={() => setOpen(true)}>
        <Icon id="trash" size={18} />
        {t('deletion.request.open')}
      </button>
      {open && <RequestDeletionDialog kind={kind} targetId={targetId} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function RequestDeletionDialog({ kind, targetId, label, onClose }: { kind: Kind; targetId: string; label: string; onClose(): void }) {
  const t = useT();
  const to = useAdminPath();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState(false);
  const create = useApiMutation('deletionCreate', ['deletionList']);
  const err = reason.trim().length < 10 ? t('staffui.reasonShort', { min: 10 }) : null;
  const go = async () => {
    setTried(true);
    if (err) return;
    try {
      await create.mutateAsync({ body: { kind, targetId, reason: reason.trim() } });
      toast('deletion.request.sent');
      setSent(true);
    } catch {
      /* shown below */
    }
  };
  return (
    <Sheet
      title={t('deletion.request.title', { label })}
      onClose={onClose}
      footer={
        sent ? (
          <button type="button" className={btn('primary')} onClick={onClose}>
            {t('common.close')}
          </button>
        ) : (
          <>
            <button type="button" className={btn('ghost')} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className={btn('danger')} disabled={create.isPending} onClick={go}>
              <Icon id="send" size={18} />
              {t('deletion.request.submit')}
            </button>
          </>
        )
      }
    >
      {sent ? (
        <p className="text-base text-ink">
          {t('deletion.request.sentText')}{' '}
          <Link className="font-semibold text-accent" to={to('deletions')}>
            {t('deletion.title')}
          </Link>
        </p>
      ) : (
        <>
          <p className="text-base text-ink">{t(`deletion.request.text.${kind === 'teacher' ? 'teacher' : 'content'}`)}</p>
          <ReasonField value={reason} onChange={setReason} min={10} error={tried ? err : null} />
          <ErrorLine error={create.error} />
        </>
      )}
    </Sheet>
  );
}

function DecideDialog({ req, decision, onClose }: { req: DeletionRequest; decision: 'approve' | 'reject'; onClose(): void }) {
  const t = useT();
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const run = useApiMutation(decision === 'approve' ? 'deletionApprove' : 'deletionReject', ['deletionList']);
  const errs = {
    code: !TotpSchema.safeParse(code).success ? t('staffui.totpError') : null,
    note: decision === 'reject' && note.trim().length < 3 ? t('staffui.reasonShort', { min: 3 }) : null,
  };
  const go = async () => {
    setTried(true);
    if (errs.code || errs.note) return;
    try {
      await run.mutateAsync({ params: { id: req.id }, body: { totp: code, ...(note.trim() ? { note: note.trim() } : {}) } });
      toast(`deletion.done.${decision}`, { params: { label: req.targetLabel } });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Sheet
      title={t(`deletion.decide.${decision}.title`, { label: req.targetLabel })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn('ghost')} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={btn(decision === 'approve' ? 'danger' : 'primary')} disabled={run.isPending} onClick={go}>
            <Icon id={decision === 'approve' ? 'trash' : 'x'} size={18} />
            {t(`deletion.decide.${decision}.confirm`)}
          </button>
        </>
      }
    >
      <p className="text-base text-ink">{t(`deletion.decide.${decision}.text`)}</p>
      <div className="rounded-lg border border-line bg-chip p-3 text-base">
        <p className="text-sm text-muted">{t('deletion.col.reason')}</p>
        <p className="text-ink">{req.reason}</p>
      </div>
      {decision === 'reject' ? (
        <ReasonField value={note} onChange={setNote} min={3} label={t('deletion.decide.note')} error={tried ? errs.note : null} />
      ) : (
        <Field id="deletion-note" label={t('deletion.decide.noteOptional')}>
          <input id="deletion-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      <TotpField value={code} onChange={setCode} error={tried ? errs.code : null} />
      <ErrorLine error={run.error} />
    </Sheet>
  );
}

const STATUSES = ['pending', 'approved', 'rejected'] as const;
const TONE = { pending: 'warn', approved: 'bad', rejected: 'neutral' } as const;

export function DeletionPage() {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const canApprove = useCanCall('deletionApprove');
  const [status, setStatus] = useState<(typeof STATUSES)[number] | 'all'>(canApprove ? 'pending' : 'all');
  const [cursor, setCursor] = useState<string[]>([]);
  const q = useApiQuery('deletionList', { query: { ...(status !== 'all' ? { status } : {}), ...(cursor.length ? { cursor: cursor[cursor.length - 1] } : {}) } });
  const [decide, setDecide] = useState<{ req: DeletionRequest; decision: 'approve' | 'reject' } | null>(null);
  const items = q.data?.items ?? [];
  const tabs = ['pending', 'approved', 'rejected', 'all'] as const;
  return (
    <div className="grid gap-5">
      <PageTitle title={t('deletion.title')} description={t(canApprove ? 'deletion.leadSuper' : 'deletion.leadManager')} icon="trash" />
      <div role="tablist" aria-label={t('deletion.col.status')} className="flex flex-wrap gap-2">
        {tabs.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={cx(btn(status === s ? 'primary' : 'secondary', 'px-4'))}
            onClick={() => {
              setStatus(s);
              setCursor([]);
            }}
          >
            {t(`deletion.tab.${s}`)}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorLine error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon="check" title={t(status === 'pending' ? 'deletion.emptyPending' : 'deletion.empty')} text={t(canApprove ? 'deletion.emptyHintSuper' : 'deletion.emptyHint')} />
      ) : (
        <table className={tableCls}>
          <caption className="sr-only">{t('deletion.title')}</caption>
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>{t('deletion.col.target')}</th>
              <th className={thCls}>{t('deletion.col.reason')}</th>
              <th className={thCls}>{t('deletion.col.requested')}</th>
              <th className={thCls}>{t('deletion.col.status')}</th>
              {canApprove && (
                <th className={thCls}>
                  <span className="sr-only">{t('deletion.col.actions')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className={tbodyCls}>
            {items.map((r) => (
              <tr key={r.id} className={trCls} data-testid={`deletion-${r.id}`}>
                <Td label={t('deletion.col.target')}>
                  <span className="grid">
                    <b className="font-semibold">{r.targetLabel}</b>
                    <span className="text-sm text-muted">{t(`deletion.kind.${r.kind}`)}</span>
                  </span>
                </Td>
                <Td label={t('deletion.col.reason')} className="max-w-100">
                  {r.reason}
                </Td>
                <Td label={t('deletion.col.requested')}>
                  <span className="grid">
                    <span>{r.requestedBy.displayName}</span>
                    <span className="text-sm text-muted">{fmtDateTime(r.requestedAt, lang)}</span>
                  </span>
                </Td>
                <Td label={t('deletion.col.status')}>
                  <span className="grid justify-items-start gap-1">
                    <Chip tone={TONE[r.status]}>{t(`deletion.status.${r.status}`)}</Chip>
                    {r.decidedBy && (
                      <span className="text-sm text-muted">
                        {r.decidedBy.displayName} · {fmtDateTime(r.decidedAt, lang)}
                        {r.decisionNote ? ` — ${r.decisionNote}` : ''}
                      </span>
                    )}
                  </span>
                </Td>
                {canApprove && (
                  <Td label={t('deletion.col.actions')}>
                    {r.status === 'pending' && (
                      <span className="flex flex-wrap gap-2">
                        <button type="button" className={btn('danger', 'px-4')} onClick={() => setDecide({ req: r, decision: 'approve' })}>
                          {t('deletion.decide.approve.button')}
                        </button>
                        <button type="button" className={btn('secondary', 'px-4')} onClick={() => setDecide({ req: r, decision: 'reject' })}>
                          {t('deletion.decide.reject.button')}
                        </button>
                      </span>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager trail={cursor} next={q.data?.nextCursor} onBack={() => setCursor((c) => c.slice(0, -1))} onNext={(n) => setCursor((c) => [...c, n])} />
      {decide && <DecideDialog req={decide.req} decision={decide.decision} onClose={() => setDecide(null)} />}
    </div>
  );
}
