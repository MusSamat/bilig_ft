/** Class join code (W-53): show, re-issue, enable / disable (TZ §6 «код класса можно перевыпустить или отключить»). */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { toast } from '../../state/ui';
import { errorKey } from '../format';

export function JoinCodeTab({ cls, onChange }: { cls: SchoolClass; onChange: (c: SchoolClass) => void }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<SchoolClass>) => {
    setBusy(true);
    try {
      onChange(await fn());
      await qc.invalidateQueries({ queryKey: ['classes'] });
    } catch (e) {
      toast({ key: errorKey(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <h3>{t('teacher.joinCode')}</h3>
      <p className="join-code" aria-live="polite">
        {cls.joinCode}
      </p>
      <p className="muted">{t('teacher.joinCodeHint')}</p>
      <p>
        <span className={cls.joinCodeEnabled ? 'badge badge--ok' : 'badge badge--warn'}>{cls.joinCodeEnabled ? t('teacher.codeEnabled') : t('teacher.codeDisabled')}</span>
      </p>
      <div className="row">
        <button
          type="button"
          className="btn btn--sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const { joinCode } = await api('classJoinCode', { params: { id: cls.id }, body: {} });
              toast({ key: 'teacher.reissued', params: { code: joinCode }, kind: 'success' });
              return { ...cls, joinCode };
            })
          }
        >
          <Icon name="reset" size={16} />
          {t('teacher.reissue')}
        </button>
        <button
          type="button"
          className="btn btn--sm"
          disabled={busy}
          onClick={() => void run(() => api('classPatch', { params: { id: cls.id }, body: { joinCodeEnabled: !cls.joinCodeEnabled } }))}
        >
          <Icon name={cls.joinCodeEnabled ? 'lock' : 'check'} size={16} />
          {cls.joinCodeEnabled ? t('teacher.disable') : t('teacher.enable')}
        </button>
      </div>
    </div>
  );
}
