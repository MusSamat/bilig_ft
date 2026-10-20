/**
 * Teacher self-registration (contract 0.7.0), a lazy chunk at `/:lang/register`:
 * exactly three steps — WhatsApp number, the code from WhatsApp, a password — then
 * the teacher is signed in and lands in the cabinet, which asks for the name,
 * school and subjects (setup checklist). Signed-in users go to their cabinet.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../api/session';
import { AuthLayout, AuthNote } from '../auth/AuthLayout';
import { glass } from '../auth/ui';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';
import { OtpWizard } from './OtpWizard';

/** Loading skeleton and «already signed in» redirect shared by registration and reset. */
export function useAuthGuard(): { finishing: boolean; setFinishing: (v: boolean) => void; early: JSX.Element | null } {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.me);
  const status = useSession((s) => s.status);
  const setContext = useUi((s) => s.setContext);
  useEffect(() => setContext(null), [setContext]);
  /** Set while the last step signs in: the session turns «authed» before we navigate. */
  const [finishing, setFinishing] = useState(false);
  let early: JSX.Element | null = null;
  if (status === 'loading') {
    early = (
      <div className="page" aria-busy="true" aria-label={t('common.loading')}>
        <span className={`${glass} skel block h-[420px]`} />
      </div>
    );
  } else if (me && !finishing) {
    early = <Navigate to={me.permissions.includes('class.manage') ? `/${lang}/teacher` : `/${lang}/cabinet`} replace />;
  }
  return { finishing, setFinishing, early };
}

export default function RegisterPage(): JSX.Element {
  const { t } = useTranslation();
  const { setFinishing, early } = useAuthGuard();
  if (early) return early;
  return (
    <AuthLayout
      titleId="reg-title"
      title={t('register.title')}
      lead={t('register.lead')}
      points={[
        { icon: 'users', text: t('register.point.classes') },
        { icon: 'book', text: t('register.point.textbook') },
        { icon: 'cal', text: t('register.point.ktp') },
      ]}
      note={<AuthNote icon="clock">{t('register.trialNote')}</AuthNote>}
      cardLabel={t('register.title')}
    >
      <OtpWizard purpose="register" setFinishing={setFinishing} />
    </AuthLayout>
  );
}
