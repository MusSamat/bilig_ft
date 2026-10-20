/**
 * «Add a КТП» as a guided flow: choose or drop the .docx → «Checking…» →
 * a summary («138 lessons · 8б, 8в · 2026–2027») with the problems that need
 * attention, each with a «Fix» action → «Done». With `replaces`, the new file
 * replaces an existing plan (the old one is deleted once the new one is read).
 * The summary shows which class each КТП column is linked to (v0.8.0); with
 * `preset` (upload from a class's subject card) that class is linked to a free
 * column and an unknown subject is set before the summary shows.
 */
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { KtpIssue, KtpPatchRequest, TeachingPlan } from '@bilig/content-model/api';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { errorKey } from '../cabinet/format';
import { btn, cx } from '../cabinet/teacher/ui';
import { toast } from '../state/ui';
import { KtpFileError, ktpKeys, useKtpDelete, useKtpPlan, useKtpUpload } from './api';
import { ClassLinks } from './ClassLinks';
import { KTP_MAX_BYTES, capitalize, checkKtpFile, problemCounts } from './model';
import { ProblemCount, ProblemList } from './Problems';
import { useLang } from '../lib/hooks';

const MB = Math.round(KTP_MAX_BYTES / (1024 * 1024));

type Step = { k: 'pick'; error: string | null } | { k: 'checking'; name: string } | { k: 'done'; plan: TeachingPlan };

/** What an upload from a class's subject card already knows. */
export interface UploadPreset {
  classId: string;
  subjectKey: string;
}

/** The PATCH that links `preset.classId` to a free column and sets an unknown subject (null when nothing to do). */
export function presetPatch(plan: TeachingPlan, preset: UploadPreset): Omit<KtpPatchRequest, 'version'> | null {
  const links = plan.classLinks ?? {};
  const out: Omit<KtpPatchRequest, 'version'> = {};
  if (!Object.values(links).includes(preset.classId)) {
    const free = plan.classes.find((c) => !links[c]);
    if (free) out.classLinks = { ...Object.fromEntries(plan.classes.map((c) => [c, links[c] ?? null])), [free]: preset.classId };
  }
  if (!plan.subjectKey) out.subjectKey = preset.subjectKey;
  return Object.keys(out).length ? out : null;
}

export function UploadFlow({
  replaces,
  preset,
  onStart,
  onDone,
  onFix,
  onCancel,
}: {
  replaces?: TeachingPlan;
  /** v0.8.0: uploaded for this class and subject. */
  preset?: UploadPreset;
  /** The file passed the client checks and is being sent. */
  onStart?: () => void;
  onDone: (plan: TeachingPlan) => void;
  onFix: (plan: TeachingPlan, issue: KtpIssue) => void;
  onCancel?: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const upload = useKtpUpload();
  const del = useKtpDelete();
  const [step, setStep] = useState<Step>({ k: 'pick', error: null });

  const start = (file: File | undefined) => {
    if (!file || step.k === 'checking') return;
    const bad = checkKtpFile(file);
    if (bad) return setStep({ k: 'pick', error: t(bad, { mb: MB }) });
    setStep({ k: 'checking', name: file.name });
    onStart?.();
    upload.mutate(
      { file },
      {
        onSuccess: async (plan) => {
          if (replaces) {
            const version = qc.getQueryData<TeachingPlan>(ktpKeys.plan(replaces.id))?.version ?? replaces.version;
            await del.mutateAsync({ id: replaces.id, version }).catch((e: unknown) => toast({ key: errorKey(e), kind: 'error' }));
          }
          const fix = preset && presetPatch(plan, preset);
          if (fix) {
            try {
              const linked = await api('ktpPatch', { params: { id: plan.id }, body: { version: plan.version, ...fix }, ifMatch: plan.version });
              qc.setQueryData(ktpKeys.plan(plan.id), linked);
              plan = linked;
            } catch (e) {
              toast({ key: errorKey(e), kind: 'error' });
            }
          }
          setStep({ k: 'done', plan });
        },
        onError: (e) => setStep({ k: 'pick', error: e instanceof KtpFileError ? t(e.i18nKey, { mb: MB }) : `${t('ktp.upload.failed')}: ${t(errorKey(e))}` }),
      },
    );
  };

  if (step.k === 'done') return <Summary plan={step.plan} onDone={() => onDone(step.plan)} onFix={(i) => onFix(step.plan, i)} onAnother={() => setStep({ k: 'pick', error: null })} />;
  return (
    <div className="grid gap-4">
      {replaces && <p className="m-0 rounded-lg border border-line border-l-4 border-l-gold bg-chip p-4 text-base text-ink">{t('ktp.upload.replaceNote')}</p>}
      {step.k === 'checking' ? <Checking name={step.name} /> : <DropZone onFile={start} error={step.error} />}
      {onCancel && step.k === 'pick' && (
        <button type="button" className={btn('ghost', 'justify-self-start')} onClick={onCancel}>
          {t('ktp.upload.cancel')}
        </button>
      )}
    </div>
  );
}

function DropZone({ onFile, error }: { onFile: (f: File | undefined) => void; error: string | null }): JSX.Element {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFile(e.dataTransfer.files?.[0]);
  };
  return (
    <div className="grid gap-2">
      <div
        className={cx('grid justify-items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors', over ? 'border-accent bg-soft' : 'border-line')}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-soft text-accent" aria-hidden="true">
          <Icon name="upload" className="lg" />
        </span>
        <label className={cx(btn('primary'), 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent')}>
          <Icon name="file" className="sm" />
          {t('ktp.upload.choose')}
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label={t('ktp.upload.inputLabel')}
            aria-describedby="ktp-upload-hint ktp-upload-error"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-base text-muted">{t('ktp.upload.drop')}</span>
        <span id="ktp-upload-hint" className="text-sm text-muted">
          {t('ktp.upload.hint', { mb: MB })}
        </span>
      </div>
      <p id="ktp-upload-error" role="alert" className="m-0 text-base font-semibold text-bad empty:hidden">
        {error ?? ''}
      </p>
    </div>
  );
}

function Checking({ name }: { name: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="grid justify-items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-soft px-4 py-8 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-pill bg-panel text-accent" aria-hidden="true">
        <Icon name="sync" className="lg spin" />
      </span>
      <p className="m-0 text-lg font-semibold text-ink">{t('ktp.upload.checking')}</p>
      <p className="m-0 max-w-[48ch] text-base text-muted">{t('ktp.upload.checkingHint')}</p>
      <p className="m-0 max-w-full truncate text-sm text-muted">{name}</p>
    </div>
  );
}

function Summary({ plan: uploaded, onDone, onFix, onAnother }: { plan: TeachingPlan; onDone: () => void; onFix: (i: KtpIssue) => void; onAnother: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  // The cached plan follows the class-link edits made right here.
  const plan = useKtpPlan(uploaded.id).data ?? uploaded;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const counts = problemCounts(plan.issues);
  const problems = counts.errors + counts.warnings;
  const facts = [t('ktp.plan.lessons', { count: plan.rows.length }), plan.classes.join(', '), plan.year ? `${plan.year}–${plan.year + 1}` : null].filter(Boolean).join(' · ');
  const what = [capitalize(plan.subjectName, lang), plan.grade ? t('teacher.gradeN', { n: plan.grade }) : null].filter(Boolean).join(' · ');
  return (
    <section className="grid gap-5" aria-labelledby="ktp-summary-title" data-testid="ktp-summary">
      <div className="flex items-start gap-4">
        <span className="inline-flex size-12 flex-none items-center justify-center rounded-pill bg-soft text-ok" aria-hidden="true">
          <Icon name="check" className="lg" />
        </span>
        <div className="grid min-w-0 gap-1">
          <h3 id="ktp-summary-title" ref={heading} tabIndex={-1} className="m-0 font-serif text-xl font-bold text-ink outline-none">
            {t('ktp.summary.title')}
          </h3>
          <p className="m-0 text-lg font-semibold text-ink">{facts}</p>
          <p className="m-0 text-base text-muted">{what}</p>
          <p className="m-0 truncate text-sm text-muted">{plan.sourceName}</p>
        </div>
      </div>
      <ProblemCount errors={counts.errors} warnings={counts.warnings} className="justify-self-start" />
      <ClassLinks plan={plan} />
      {problems > 0 ? (
        <div className="grid gap-3">
          <p className="m-0 text-base font-semibold text-ink">{t('ktp.summary.attention')}</p>
          <ProblemList issues={plan.issues} rows={plan.rows} onFix={onFix} />
          <p className="m-0 text-sm text-muted">{t('ktp.summary.later')}</p>
        </div>
      ) : (
        <p className="m-0 text-base text-ink">{t('ktp.summary.allGood')}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn('primary')} onClick={onDone}>
          <Icon name="check" className="sm" />
          {t('ktp.summary.done')}
        </button>
        <button type="button" className={btn('ghost')} onClick={onAnother}>
          <Icon name="upload" className="sm" />
          {t('ktp.summary.another')}
        </button>
      </div>
    </section>
  );
}
