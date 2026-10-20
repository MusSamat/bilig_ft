/**
 * «Профиль жана мектеп»: name, WhatsApp number (read-only), school, subjects
 * and grades, interface language and access (licences, «доступ» in the UI).
 * A self-registered teacher (trial) edits name, school and teaching inline
 * (PATCH /me); with a school licence only the name is theirs to change.
 */
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatKgPhone } from '@bilig/content-model/api';
import type { MyLicense } from '@bilig/content-model/api';
import { api } from '../../api/client';
import { logout, patchMe, useSession } from '../../api/session';
import { Icon } from '../../components/Icon';
import { HEADER_LANGS } from '../../config';
import { useLang } from '../../lib/hooks';
import { switchLangPath } from '../../lib/urls';
import { formatDate } from '../format';
import { NameForm, SchoolForm, TeachingForm, TeachingLangForm, daysLeft, trialOf } from './profileForms';
import { SubjectKeyChip, formatGrades } from './TeachingPicker';
import { Card, CardTitle, Chip, ErrorState, Loading, btn, cx } from './ui';

type Editing = 'name' | 'school' | 'teaching' | 'teachingLang' | null;

export function ProfileSection(): JSX.Element | null {
  const { t } = useTranslation();
  const me = useSession((s) => s.me);
  const [editing, setEditing] = useState<Editing>(null);
  if (!me) return null;
  const trial = trialOf(me);
  const licenses = me.licenses ?? [];
  const school = trial?.schoolName ?? licenses[0]?.schoolName;
  // A school-licensed teacher has no own `teaching`: show what the school's access covers.
  const teaching = me.teaching ?? { subjects: [...new Set(licenses.flatMap((l) => l.subjects))], grades: [...new Set(licenses.flatMap((l) => l.grades))] };
  const close = (k: Exclude<Editing, null>) => {
    setEditing(null);
    requestAnimationFrame(() => document.getElementById(`profile-edit-${k}`)?.focus());
  };
  const editBtn = (k: Exclude<Editing, null>, label: string) => (
    <button type="button" id={`profile-edit-${k}`} className={btn('ghost')} onClick={() => setEditing(k)} aria-label={t('teacher.profile.editOf', { what: label })}>
      <Icon name="edit" className="sm" />
      {t('common.edit')}
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card labelledBy="profile-me" className="grid content-start gap-4">
        <CardTitle id="profile-me" icon="user">
          {t('teacher.profile.me')}
        </CardTitle>
        <dl className="m-0 grid gap-0 divide-y divide-line">
          <Row label={t('teacher.profile.name')} action={editing !== 'name' && editBtn('name', t('teacher.profile.name'))}>
            {editing === 'name' ? <NameForm idBase="profile" onDone={() => close('name')} onCancel={() => close('name')} /> : me.setup?.name === false ? <Missing /> : me.displayName}
          </Row>
          {me.phone && (
            <Row label={t('teacher.profile.phone')}>
              <span className="font-mono">{formatKgPhone(me.phone)}</span>
              <span className="block text-sm text-muted">{t('teacher.profile.phoneHint')}</span>
            </Row>
          )}
          {me.email && <Row label={t('teacher.profile.email')}>{me.email}</Row>}
          <Row label={t('teacher.profile.language')}>
            <LanguageSwitch />
          </Row>
        </dl>
      </Card>

      <Card labelledBy="profile-school" className="grid content-start gap-4">
        <CardTitle id="profile-school" icon="school">
          {t('teacher.profile.school')}
        </CardTitle>
        <dl className="m-0 grid gap-0 divide-y divide-line">
          <Row label={t('teacher.profile.schoolName')} action={trial && editing !== 'school' && editBtn('school', t('teacher.profile.schoolName'))}>
            {editing === 'school' ? <SchoolForm idBase="profile" onDone={() => close('school')} onCancel={() => close('school')} /> : me.setup?.school === false || !school ? <Missing /> : school}
          </Row>
          <Row label={t('teacher.profile.teachingLang')} action={editing !== 'teachingLang' && editBtn('teachingLang', t('teacher.profile.teachingLang'))}>
            {editing === 'teachingLang' ? (
              <TeachingLangForm idBase="profile" onDone={() => close('teachingLang')} onCancel={() => close('teachingLang')} />
            ) : me.teachingLang ? (
              t(`teacher.teachingLang.${me.teachingLang}`)
            ) : (
              <Missing />
            )}
          </Row>
          <Row label={t('teacher.profile.teaching')} action={trial && editing !== 'teaching' && editBtn('teaching', t('teacher.profile.teaching'))}>
            {editing === 'teaching' ? (
              <TeachingForm idBase="profile" onDone={() => close('teaching')} onCancel={() => close('teaching')} />
            ) : teaching.subjects.length ? (
              <span className="grid gap-2">
                <span className="flex flex-wrap gap-1.5">
                  {teaching.subjects.map((k) => (
                    <SubjectKeyChip key={k} subjectKey={k} />
                  ))}
                </span>
                <span>{t('teacher.gradesShort', { grades: formatGrades(teaching.grades) })}</span>
              </span>
            ) : (
              <Missing />
            )}
          </Row>
        </dl>
        {!trial && licenses.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-muted">
            <Icon name="info" className="sm mt-0.5" />
            {t('teacher.profile.readOnly')}
          </p>
        )}
      </Card>

      {licenses.length > 0 && (
        <Card labelledBy="profile-access" className="grid content-start gap-4 lg:col-span-2">
          <CardTitle id="profile-access" icon="key">
            {t('teacher.profile.access')}
          </CardTitle>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {licenses.map((l) => (
              <AccessRow key={`${l.schoolId}:${l.startsAt}`} lic={l} />
            ))}
          </ul>
        </Card>
      )}
      <SessionsCard />
    </div>
  );
}

/** Where the account is signed in, and «sign out everywhere» (moved here from /cabinet). */
function SessionsCard(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const sessions = useQuery({ queryKey: ['me-sessions'], queryFn: () => api('meSessions'), retry: false });
  const [confirm, setConfirm] = useState(false);
  return (
    <Card labelledBy="profile-sessions" className="grid content-start gap-4 lg:col-span-2">
      <CardTitle id="profile-sessions" icon="shield">
        {t('teacher.profile.sessions')}
      </CardTitle>
      {sessions.isLoading && <Loading rows={1} />}
      {sessions.isError && <ErrorState text={t('teacher.loadError')} onRetry={() => void sessions.refetch()} />}
      {!!sessions.data?.items.length && (
        <ul className="m-0 grid list-none divide-y divide-line p-0">
          {sessions.data.items.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0">
              <b className="text-ink">{x.device}</b>
              {x.current && <Chip tone="ok">{t('teacher.profile.thisDevice')}</Chip>}
              <span className="w-full text-sm text-muted">{t('teacher.profile.signedIn', { date: formatDate(lang, x.createdAt, true) })}</span>
            </li>
          ))}
        </ul>
      )}
      {confirm ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad p-4" role="group" aria-label={t('teacher.profile.logoutAllConfirm')}>
          <span className="basis-full font-semibold text-ink">{t('teacher.profile.logoutAllConfirm')}</span>
          <button
            type="button"
            className={btn('danger')}
            onClick={async () => {
              await logout(true);
              navigate(`/${lang}`);
            }}
          >
            <Icon name="logout" className="sm" />
            {t('teacher.profile.logoutAllYes')}
          </button>
          <button type="button" className={btn('ghost')} onClick={() => setConfirm(false)} autoFocus>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className={btn('secondary')} onClick={() => setConfirm(true)}>
            <Icon name="logout" className="sm" />
            {t('teacher.profile.logoutAll')}
          </button>
        </div>
      )}
    </Card>
  );
}

function Row({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <dt className="text-sm font-semibold text-muted">{label}</dt>
        {action}
      </div>
      <dd className="m-0 text-base text-ink">{children}</dd>
    </div>
  );
}

function Missing(): JSX.Element {
  const { t } = useTranslation();
  return <span className="text-muted italic">{t('teacher.profile.missing')}</span>;
}

function AccessRow({ lic }: { lic: MyLicense }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const days = daysLeft(lic.endsAt);
  return (
    <li className="grid gap-2 rounded-lg border border-line bg-chip p-4">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-ink">{lic.trial ? t('teacher.profile.trialAccess') : lic.schoolName}</b>
        {lic.trial && (
          <Chip tone={days <= 7 ? 'warn' : 'neutral'}>
            <Icon name="clock" className="sm" />
            {t('teacher.trialLeft', { count: days })}
          </Chip>
        )}
      </div>
      {lic.subjects.length > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {lic.subjects.map((k) => (
            <SubjectKeyChip key={k} subjectKey={k} />
          ))}
        </span>
      ) : (
        <span className="text-sm text-muted">{t('teacher.profile.accessNoSubjects')}</span>
      )}
      <p className="text-sm text-muted">
        {[lic.grades.length ? t('teacher.gradesShort', { grades: formatGrades(lic.grades) }) : null, t('teacher.profile.until', { date: formatDate(lang, lic.endsAt) })].filter(Boolean).join(' · ')}
      </p>
    </li>
  );
}

/** The interface language: goes to the same page in the chosen language and remembers it on the account. */
function LanguageSwitch(): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const loc = useLocation();
  return (
    <span className="inline-flex flex-wrap gap-1 rounded-pill border border-line bg-chip p-1" role="group" aria-label={t('teacher.profile.language')}>
      {HEADER_LANGS.map((l) => (
        <Link
          key={l}
          to={switchLangPath(loc.pathname, loc.search, loc.hash, l)}
          hrefLang={l}
          lang={l}
          aria-current={l === lang ? 'true' : undefined}
          onClick={() => void patchMe({ locale: l }).catch(() => undefined)}
          className={cx('inline-flex min-h-11 items-center rounded-pill px-4 text-base font-semibold no-underline', l === lang ? 'bg-accent text-on' : 'text-ink hover:bg-soft')}
        >
          {t(`header.langName.${l}`, { lng: l })}
        </Link>
      ))}
    </span>
  );
}
