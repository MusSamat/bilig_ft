/**
 * Table-driven CRUD for the dictionary-like admin entities (A-02 subjects &
 * groups, A-03 courses/units/objectives, A-04 concepts, A-08 processes,
 * A-10 items, A-12 glossary). One definition per entity: schema, endpoints,
 * columns, filters. Forms come from the schema through the editor registry.
 */
import type { ReactNode } from 'react';
import type { z } from 'zod';
import {
  ConceptSchema,
  CourseSchema,
  GlossaryTermSchema,
  ItemSchema,
  ObjectiveSchema,
  ProcessSchema,
  SubjectGroupSchema,
  SubjectSchema,
  UnitSchema,
  t as tl,
  type Lang,
  type Localized,
} from '@bilig/content-model';
import type { EndpointName } from '@bilig/content-model/api';
import type { TFn } from '../i18n';
import type { Column } from '../lists/ListView';
import { Icon } from '../lib/icons';
import { StatusBadge } from '../shell/ui';

export interface AdminRec<T = Record<string, unknown>> {
  id: string;
  data: T;
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

type Src = 'subjects' | 'groups' | 'courses' | 'units' | 'objectives' | 'concepts' | 'processes' | 'items';

export interface ResourceDef {
  id: string;
  titleKey: string;
  schema: z.ZodTypeAny;
  keyField: 'key' | 'id';
  list: EndpointName;
  get?: EndpointName;
  create: EndpointName;
  patch: EndpointName;
  del?: EndpointName;
  /** Path param name for get/patch/delete. */
  param: 'key' | 'id';
  patchBody(data: Record<string, unknown>, version: number): unknown;
  columns(t: TFn, lang: Lang): Column<AdminRec<any>>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  filters: ('q' | 'subjectKey' | 'status')[];
  suggest: Src[];
  /** Fields omitted from the form (besides the key on edit). */
  hidden?: string[];
}

const title = (lang: Lang) => (r: AdminRec<{ title?: Localized }>) => tl(r.data.title, lang);
const keyCol = (t: TFn): Column<AdminRec<{ key?: string; id?: string }>> => ({
  key: 'key',
  header: t('fields.key'),
  render: (r) => <code>{r.data.key ?? r.data.id}</code>,
  sortValue: (r) => r.data.key ?? r.data.id,
});
const titleCol = (t: TFn, lang: Lang): Column<AdminRec<{ title?: Localized }>> => ({
  key: 'title',
  header: t('fields.title'),
  render: title(lang),
  sortValue: title(lang),
});
const updatedCol = (t: TFn, lang: Lang): Column<AdminRec> => ({
  key: 'updatedAt',
  header: t('fields.updatedAt'),
  render: (r) => new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.updatedAt)),
  sortValue: (r) => r.updatedAt,
});
const col = <T,>(key: string, header: ReactNode, render: (d: T) => ReactNode, sortValue?: (d: T) => string | number | undefined): Column<AdminRec<T>> => ({
  key,
  header,
  render: (r) => render(r.data),
  sortValue: sortValue ? (r) => sortValue(r.data) : undefined,
});

/** PATCH = partial doc (`key` is stripped by the patch schema) + version. */
const partialPatch = (data: Record<string, unknown>, version: number) => ({ ...data, version });

/* eslint-disable @typescript-eslint/no-explicit-any */
export const RESOURCES: Record<string, ResourceDef> = {
  subjects: {
    id: 'subjects',
    titleKey: 'nav.subjects',
    schema: SubjectSchema,
    keyField: 'key',
    list: 'adminSubjectList',
    get: 'adminSubjectGet',
    create: 'adminSubjectCreate',
    patch: 'adminSubjectPatch',
    del: 'adminSubjectDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q'],
    suggest: ['groups'],
    columns: (t, lang) => [
      col<any>('icon', t('fields.icon'), (d) => <span style={{ color: `hsl(${d.hue} 60% 42%)` }}><Icon id={d.icon} /></span>),
      keyCol(t),
      titleCol(t, lang),
      col<any>('group', t('fields.group'), (d) => d.group, (d) => d.group),
      col<any>('order', t('fields.order'), (d) => d.order, (d) => d.order),
      col<any>('hue', t('fields.hue'), (d) => <span className="adm-swatch" style={{ background: `hsl(${d.hue} 65% 45%)` }} title={String(d.hue)} />, (d) => d.hue),
      col<any>('status', t('fields.status'), (d) => <StatusBadge status={d.status} />, (d) => d.status),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  groups: {
    id: 'groups',
    titleKey: 'nav.groups',
    schema: SubjectGroupSchema,
    keyField: 'key',
    list: 'adminGroupList',
    create: 'adminGroupCreate',
    patch: 'adminGroupPatch',
    del: 'adminGroupDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q'],
    suggest: [],
    columns: (t, lang) => [keyCol(t), titleCol(t, lang), col<any>('order', t('fields.order'), (d) => d.order, (d) => d.order), updatedCol(t, lang)] as Column<AdminRec<any>>[],
  },
  courses: {
    id: 'courses',
    titleKey: 'nav.courses',
    schema: CourseSchema,
    keyField: 'key',
    list: 'adminCourseList',
    get: 'adminCourseGet',
    create: 'adminCourseCreate',
    patch: 'adminCoursePatch',
    del: 'adminCourseDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q', 'subjectKey'],
    suggest: ['subjects'],
    columns: (t, lang) => [
      keyCol(t),
      titleCol(t, lang),
      col<any>('subjectKey', t('fields.subjectKey'), (d) => d.subjectKey, (d) => d.subjectKey),
      col<any>('grade', t('fields.grade'), (d) => d.grade, (d) => d.grade),
      col<any>('curriculum', t('fields.curriculum'), (d) => d.curriculum),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  units: {
    id: 'units',
    titleKey: 'nav.units',
    schema: UnitSchema,
    keyField: 'key',
    list: 'adminUnitList',
    get: 'adminUnitGet',
    create: 'adminUnitCreate',
    patch: 'adminUnitPatch',
    del: 'adminUnitDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q', 'subjectKey'],
    suggest: ['courses'],
    columns: (t, lang) => [
      keyCol(t),
      titleCol(t, lang),
      col<any>('courseKey', t('fields.courseKey'), (d) => d.courseKey, (d) => d.courseKey),
      col<any>('order', t('fields.order'), (d) => d.order, (d) => d.order),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  objectives: {
    id: 'objectives',
    titleKey: 'nav.objectives',
    schema: ObjectiveSchema,
    keyField: 'key',
    list: 'adminObjectiveList',
    get: 'adminObjectiveGet',
    create: 'adminObjectiveCreate',
    patch: 'adminObjectivePatch',
    del: 'adminObjectiveDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q', 'subjectKey'],
    suggest: ['units'],
    columns: (t, lang) => [
      col<any>('code', t('fields.code'), (d) => <code>{d.code}</code>, (d) => d.code),
      keyCol(t),
      col<any>('text', t('fields.text'), (d) => tl(d.text, lang)),
      col<any>('unitKey', t('fields.unitKey'), (d) => d.unitKey, (d) => d.unitKey),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  concepts: {
    id: 'concepts',
    titleKey: 'nav.concepts',
    schema: ConceptSchema,
    keyField: 'key',
    list: 'adminConceptList',
    get: 'adminConceptGet',
    create: 'adminConceptCreate',
    patch: 'adminConceptPatch',
    del: 'adminConceptDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q', 'subjectKey'],
    suggest: ['concepts'],
    columns: (t, lang) => [
      col<any>('hue', '', (d) => <span className="adm-dot" style={{ background: `hsl(${d.hue} 65% 50%)` }} />),
      keyCol(t),
      titleCol(t, lang),
      col<any>('kind', t('fields.kind'), (d) => d.kind, (d) => d.kind),
      col<any>('props', t('fields.props'), (d) => d.props.length, (d) => d.props.length),
      col<any>('isContainer', t('fields.isContainer'), (d) => (d.isContainer ? <Icon id="check" size={18} className="adm-ok" /> : '')),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  processes: {
    id: 'processes',
    titleKey: 'nav.processes',
    schema: ProcessSchema,
    keyField: 'key',
    list: 'adminProcessList',
    get: 'adminProcessGet',
    create: 'adminProcessCreate',
    patch: 'adminProcessPatch',
    del: 'adminProcessDelete',
    param: 'key',
    patchBody: partialPatch,
    filters: ['q', 'subjectKey'],
    suggest: ['concepts'],
    columns: (t, lang) => [
      col<any>('icon', '', (d) => <Icon id={d.icon} />),
      keyCol(t),
      titleCol(t, lang),
      col<any>('engine', t('fields.engine'), (d) => t(`enum.${d.engine}`, { defaultValue: d.engine }), (d) => d.engine),
      col<any>('steps', t('fields.steps'), (d) => d.steps.length, (d) => d.steps.length),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  items: {
    id: 'items',
    titleKey: 'nav.items',
    schema: ItemSchema,
    keyField: 'key',
    list: 'adminItemList',
    get: 'adminItemGet',
    create: 'adminItemCreate',
    patch: 'adminItemPatch',
    del: 'adminItemDelete',
    param: 'key',
    patchBody: (data, version) => ({ data, version }),
    filters: ['q', 'subjectKey'],
    suggest: ['objectives', 'concepts'],
    columns: (t, lang) => [
      keyCol(t),
      col<any>('type', t('fields.type'), (d) => t(`enum.${d.type}`, { defaultValue: d.type }), (d) => d.type),
      col<any>('prompt', t('fields.prompt'), (d) => tl(d.prompt, lang)),
      col<any>('difficulty', t('fields.difficulty'), (d) => (
        <span className="adm-dots" role="img" aria-label={String(d.difficulty)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <i key={n} className={n <= d.difficulty ? 'is-on' : undefined} />
          ))}
        </span>
      ), (d) => d.difficulty),
      col<any>('objectiveKeys', t('fields.objectiveKeys'), (d) => d.objectiveKeys.join(', ')),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
  glossary: {
    id: 'glossary',
    titleKey: 'nav.glossary',
    schema: GlossaryTermSchema,
    keyField: 'id',
    list: 'adminGlossaryList',
    create: 'adminGlossaryCreate',
    patch: 'adminGlossaryPatch',
    del: 'adminGlossaryDelete',
    param: 'id',
    patchBody: (data, version) => {
      const { id: _id, ...rest } = data;
      return { ...rest, version };
    },
    filters: ['q'],
    suggest: [],
    columns: (t, lang) => [
      keyCol(t),
      col<any>('ru', 'ru', (d) => d.ru, (d) => d.ru),
      col<any>('ky', 'ky', (d) => d.ky, (d) => d.ky),
      col<any>('en', 'en', (d) => d.en, (d) => d.en),
      col<any>('forbidden', t('fields.forbidden'), (d) => d.forbidden.join(', ')),
      col<any>('approvedBy', t('fields.approvedBy'), (d) => d.approvedBy ?? '—'),
      updatedCol(t, lang),
    ] as Column<AdminRec<any>>[],
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const recordKey = (def: ResourceDef, r: AdminRec) => String((r.data as Record<string, unknown>)[def.keyField]);
