/**
 * Course tree & breadcrumbs (TZ W-04: предмет → раздел → тема), built from the
 * catalog data (Subject → Course → Unit → Topic).
 */
import type { Catalog, Course, Localized, Subject, TopicSummary, Unit } from '@bilig/content-model';

export type CrumbKind = 'subject' | 'course' | 'unit' | 'topic';
export interface Crumb {
  kind: CrumbKind;
  key: string;
  title: Localized;
}

/** Breadcrumb path to a topic. Missing levels are skipped; unknown topic → []. */
export function breadcrumbs(catalog: Catalog, topicKey: string): Crumb[] {
  const topic = catalog.topics.find((t) => t.key === topicKey);
  if (!topic) return [];
  const unit = catalog.units.find((u) => u.key === topic.unitKey);
  const course = unit && catalog.courses.find((c) => c.key === unit.courseKey);
  const subject = catalog.subjects.find((s) => s.key === (course?.subjectKey ?? topic.subjectKey));
  const out: Crumb[] = [];
  if (subject) out.push({ kind: 'subject', key: subject.key, title: subject.title });
  if (course) out.push({ kind: 'course', key: course.key, title: course.title });
  if (unit) out.push({ kind: 'unit', key: unit.key, title: unit.title });
  out.push({ kind: 'topic', key: topic.key, title: topic.title });
  return out;
}

export interface UnitNode {
  unit: Unit;
  topics: TopicSummary[];
}
export interface CourseNode {
  course: Course;
  units: UnitNode[];
}
export interface SubjectTree {
  subject: Subject;
  courses: CourseNode[];
}

/** Subject → courses (by grade) → units (by order) → topics (by key). */
export function subjectTree(catalog: Catalog, subjectKey: string): SubjectTree | null {
  const subject = catalog.subjects.find((s) => s.key === subjectKey);
  if (!subject) return null;
  const courses = catalog.courses
    .filter((c) => c.subjectKey === subjectKey)
    .sort((a, b) => a.grade - b.grade || a.key.localeCompare(b.key))
    .map((course) => ({
      course,
      units: catalog.units
        .filter((u) => u.courseKey === course.key)
        .sort((a, b) => a.order - b.order)
        .map((unit) => ({
          unit,
          topics: catalog.topics
            .filter((t) => t.unitKey === unit.key)
            .sort((a, b) => a.key.localeCompare(b.key)),
        })),
    }));
  return { subject, courses };
}

/** Subjects grouped for the catalog modal (W-02): groups by order, subjects by order. */
export function groupedSubjects(catalog: Catalog): { groupKey: string; title: Localized; subjects: Subject[] }[] {
  return [...catalog.groups]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      groupKey: g.key,
      title: g.title,
      subjects: catalog.subjects.filter((s) => s.group === g.key).sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.subjects.length > 0);
}
