/**
 * «Кирүү коду»: the code students type on the sign-in page; copy, give a new
 * one (the old stops working — asks first) or switch it off and on.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey } from '../format';
import { Chip, CopyButton, btn, cx } from './ui';

export function JoinCodeTab({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (fn: () => Promise<SchoolClass>) => {
    setBusy(true);
    try {
      onChange(await fn());
      await qc.invalidateQueries({ queryKey: ['classes'] });
    } catch (e) {
      toast({ key: errorKey(e), kind: 'error' });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const reissue = () =>
    void run(async () => {
      const { joinCode } = await api('classJoinCode', { params: { id: cls.id }, body: {} });
      toast({ key: 'teacher.reissued', params: { code: joinCode }, kind: 'success' });
      return { ...cls, joinCode };
    });

  return (
    <div className="grid max-w-[60ch] gap-5">
      <div className="grid gap-1">
        <h2 className="font-serif text-lg font-bold text-ink">{t('teacher.joinCode')}</h2>
        <p className="text-base text-muted">{t('teacher.joinCodeHint')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-chip p-4">
        <p className={cx('m-0 font-mono text-2xl font-bold tracking-[0.2em] md:text-[40px]', cls.joinCodeEnabled ? 'text-accent' : 'text-muted line-through')} aria-live="polite">
          {cls.joinCode}
        </p>
        <Chip tone={cls.joinCodeEnabled ? 'ok' : 'warn'}>{cls.joinCodeEnabled ? t('teacher.codeEnabled') : t('teacher.codeDisabled')}</Chip>
        {cls.joinCodeEnabled && <CopyButton value={cls.joinCode} label={t('teacher.copyCode')} withText className="ms-auto" />}
      </div>
      {confirm ? (
        <div className="grid gap-3 rounded-lg border border-bad p-4" role="group" aria-label={t('teacher.reissueConfirm')}>
          <p className="font-semibold text-ink">{t('teacher.reissueConfirm')}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={btn('danger')} disabled={busy} onClick={reissue}>
              <Icon name="reset" className="sm" />
              {t('teacher.reissueYes')}
            </button>
            <button type="button" className={btn('ghost')} onClick={() => setConfirm(false)} autoFocus>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btn('secondary')} disabled={busy} onClick={() => setConfirm(true)}>
            <Icon name="reset" className="sm" />
            {t('teacher.reissue')}
          </button>
          <button
            type="button"
            className={btn('secondary')}
            disabled={busy}
            onClick={() => void run(() => api('classPatch', { params: { id: cls.id }, body: { joinCodeEnabled: !cls.joinCodeEnabled } }))}
          >
            <Icon name={cls.joinCodeEnabled ? 'lock' : 'check'} className="sm" />
            {cls.joinCodeEnabled ? t('teacher.disable') : t('teacher.enable')}
          </button>
        </div>
      )}
    </div>
  );
}
