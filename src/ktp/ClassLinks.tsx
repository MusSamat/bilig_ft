/**
 * КТП ↔ classes (contract 0.8.0 §6): which of the teacher's classes each КТП
 * class column is. The server matches names on upload (case and spaces
 * ignored); here each column shows its class and a small «Класска
 * байланыштыруу» select changes it (PATCH /ktp/:id { classLinks }). A class's
 * subject card uses the plan whose subject and link match, so the cards are
 * refreshed after a change.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TeachingPlan } from '@bilig/content-model/api';
import { Icon } from '../components/Icon';
import { useClasses } from '../cabinet/teacher/ClassesSection';
import { cx, inputCls } from '../cabinet/teacher/ui';
import { toast } from '../state/ui';
import { useKtpPatch } from './api';

export function ClassLinks({ plan, className }: { plan: TeachingPlan; className?: string }): JSX.Element | null {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const patch = useKtpPatch(plan.id);
  const classes = useClasses();
  const list = classes.data?.pages.flatMap((p) => p.items) ?? [];
  if (!plan.classes.length) return null;
  const links = plan.classLinks ?? {};
  // Same-grade classes first: an 8th-grade КТП is most likely for 8th-grade classes.
  const options = [...list].sort((a, b) => Number(b.grade === plan.grade) - Number(a.grade === plan.grade));

  const link = (col: string, classId: string | null) =>
    void patch([], { classLinks: { ...links, [col]: classId } }).then((saved) => {
      if (!saved) return;
      toast({ key: 'ktp.links.saved', kind: 'success' });
      void qc.invalidateQueries({ queryKey: ['classes', 'subjects'] });
    });

  return (
    <section className={cx('grid gap-3', className)} aria-labelledby={`ktp-links-${plan.id}`} data-testid="ktp-class-links">
      <div className="grid gap-1">
        <h3 id={`ktp-links-${plan.id}`} className="m-0 flex items-center gap-2 text-md font-semibold text-ink">
          <Icon name="link" className="sm text-muted" />
          {t('ktp.links.title')}
        </h3>
        <p className="m-0 text-sm text-muted">{t('ktp.links.hint')}</p>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {plan.classes.map((col) => {
          const id = links[col] ?? null;
          const linked = id ? list.find((c) => c.id === id) : undefined;
          const selectId = `ktp-link-${plan.id}-${col}`;
          return (
            <li key={col} className={cx('grid gap-2 rounded-lg border p-3', linked ? 'border-line bg-chip' : 'border-gold bg-chip')}>
              <div className="flex flex-wrap items-center gap-2 text-base">
                <span className="font-semibold text-ink">{t('ktp.links.column', { class: col })}</span>
                <Icon name="arrow-right" className="sm text-muted" />
                <span className={linked ? 'font-semibold text-ink' : 'text-muted'}>{linked ? linked.name : t('ktp.links.none')}</span>
              </div>
              <label htmlFor={selectId} className="text-sm font-semibold text-muted">
                {t('ktp.links.control')}
              </label>
              <select
                id={selectId}
                className={inputCls}
                value={id ?? ''}
                disabled={classes.isLoading}
                aria-label={t('ktp.links.controlFor', { class: col })}
                onChange={(e) => link(col, e.target.value || null)}
              >
                <option value="">{t('ktp.links.noneOption')}</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {t('teacher.gradeN', { n: c.grade })}
                  </option>
                ))}
                {id && !linked && classes.isSuccess && <option value={id}>{t('ktp.links.unknown')}</option>}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
