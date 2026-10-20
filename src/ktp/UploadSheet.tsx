/**
 * «КТП жүктөө» from a class's subject card (contract 0.8.0 §6): the upload
 * flow in a sheet that already knows the class and the subject — once the
 * file is read, the class is linked to a КТП column (when the names did not
 * match it already) and an unknown subject is set. Lazy chunk.
 */
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../cabinet/teacher/ui';
import { useSubjectTitle } from '../cabinet/teacher/TeachingPicker';
import { useLang } from '../lib/hooks';
import { fixTarget } from './model';
import { UploadFlow } from './UploadFlow';

export default function KtpUploadSheet({ classId, className, subjectKey, onClose }: { classId: string; className: string; subjectKey: string; onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const subjectTitle = useSubjectTitle();
  return (
    <Sheet title={t('ktp.upload.forClass', { subject: subjectTitle(subjectKey), name: className })} onClose={onClose}>
      <UploadFlow
        preset={{ classId, subjectKey }}
        onDone={onClose}
        onFix={(p, i) => {
          const target = fixTarget(i);
          navigate({ pathname: `/${lang}/teacher/ktp/${p.id}`, search: target ? `?${new URLSearchParams(target)}` : '' });
        }}
        onCancel={onClose}
      />
    </Sheet>
  );
}
