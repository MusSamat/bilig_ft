/** A small subject-coloured chip (hue tokens via `subjectSwatch`), e.g. the subjects of a textbook's chapters. */
import { t as tr, type Subject } from '@bilig/content-model';
import { subjectSwatch } from '@bilig/scene-core';
import { useLang } from '../lib/hooks';
import { useUi } from '../state/ui';
import { Icon } from './Icon';

export function SubjectChip({ subject }: { subject: Subject }): JSX.Element {
  const lang = useLang();
  const theme = useUi((s) => s.theme);
  const sw = subjectSwatch(subject.hue, theme);
  return (
    <span className="pill subj-chip" style={{ background: sw.bg, color: sw.fg }}>
      <Icon name={subject.icon} className="sm" />
      {tr(subject.title, lang)}
    </span>
  );
}
