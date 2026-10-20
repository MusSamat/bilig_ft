/**
 * Password reset (contract 0.7.0) at `/:lang/reset`: the WhatsApp number, the code
 * from WhatsApp, a new password twice → POST /auth/password/set signs in (other
 * sessions are signed out by the server).
 */
import { useTranslation } from 'react-i18next';
import { AuthLayout, AuthNote } from '../auth/AuthLayout';
import { OtpWizard } from './OtpWizard';
import { useAuthGuard } from './RegisterPage';

export default function ResetPage(): JSX.Element {
  const { t } = useTranslation();
  const { setFinishing, early } = useAuthGuard();
  if (early) return early;
  return (
    <AuthLayout
      titleId="reset-title"
      title={t('register.reset.title')}
      lead={t('register.reset.lead')}
      points={[
        { icon: 'chat', text: t('register.reset.point.code') },
        { icon: 'lock', text: t('register.reset.point.password') },
        { icon: 'shield', text: t('register.reset.point.sessions') },
      ]}
      note={<AuthNote icon="info">{t('register.reset.staffNote')}</AuthNote>}
      cardLabel={t('register.reset.title')}
    >
      <OtpWizard purpose="reset" setFinishing={setFinishing} />
    </AuthLayout>
  );
}
