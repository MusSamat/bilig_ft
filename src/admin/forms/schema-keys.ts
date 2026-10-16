/** Field keys and enum values that a schema's generated form can show (for i18n coverage). */
import { z } from 'zod';
import {
  ComparisonSchema,
  ConceptSchema,
  CourseSchema,
  GlossaryTermSchema,
  ItemSchema,
  ObjectiveSchema,
  ProcessSchema,
  QuizSpecSchema,
  SubjectGroupSchema,
  SubjectSchema,
  TopicSchema,
  TourStepSchema,
  UnitSchema,
} from '@bilig/content-model';
import {
  AdminTopicCreateSchema,
  AssetUploadRequestSchema,
  InviteCreateRequestSchema,
  LicenseSchema,
  SchoolCreateSchema,
  TutorSettingsSchema,
  UserGrantsPutSchema,
} from '@bilig/content-model/api';
import { ROLES, SCOPES, AUTHOR_SUBROLES } from '@bilig/permissions';
import { isLocalizedSchema, unwrap } from './zod-utils';

/** Every schema the admin renders as a generated form. */
export const FORM_SCHEMAS: z.ZodTypeAny[] = [
  SubjectSchema,
  SubjectGroupSchema,
  CourseSchema,
  UnitSchema,
  ObjectiveSchema,
  ConceptSchema,
  ProcessSchema,
  ItemSchema,
  GlossaryTermSchema,
  TopicSchema,
  TourStepSchema,
  ComparisonSchema,
  QuizSpecSchema,
  AdminTopicCreateSchema,
  AssetUploadRequestSchema,
  SchoolCreateSchema,
  LicenseSchema,
  InviteCreateRequestSchema,
  UserGrantsPutSchema,
  TutorSettingsSchema,
];

export function schemaKeys(schema: z.ZodTypeAny, out = { fields: new Set<string>(), enums: new Set<string>() }, seen = new Set<z.ZodTypeAny>()) {
  const { base } = unwrap(schema);
  if (seen.has(base)) return out;
  seen.add(base);
  if (isLocalizedSchema(base)) return out;
  if (base instanceof z.ZodObject) {
    for (const [k, v] of Object.entries(base.shape as Record<string, z.ZodTypeAny>)) {
      out.fields.add(k);
      schemaKeys(v, out, seen);
    }
  } else if (base instanceof z.ZodArray) schemaKeys(base.element, out, seen);
  else if (base instanceof z.ZodRecord) schemaKeys(base.valueSchema, out, seen);
  else if (base instanceof z.ZodTuple) (base.items as z.ZodTypeAny[]).forEach((i) => schemaKeys(i, out, seen));
  else if (base instanceof z.ZodEnum) (base.options as string[]).forEach((o) => out.enums.add(o));
  else if (base instanceof z.ZodDiscriminatedUnion) {
    out.fields.add(base.discriminator);
    for (const [v, opt] of base.optionsMap.entries()) {
      out.enums.add(String(v));
      schemaKeys(opt as z.ZodTypeAny, out, seen);
    }
  } else if (base instanceof z.ZodUnion) (base.options as z.ZodTypeAny[]).forEach((o) => schemaKeys(o, out, seen));
  return out;
}

/** Enum values rendered outside generated forms (statuses, roles, scopes …). */
export const EXTRA_ENUMS: string[] = [
  ...ROLES,
  ...SCOPES,
  ...AUTHOR_SUBROLES,
  'draft', 'review', 'published', 'archived',
  'uploaded', 'processing', 'ready', 'failed', 'queued', 'building',
  'active', 'blocked', 'invited', 'suspended',
  'machine', 'reviewed',
  'adult', 'student',
  'error', 'warning',
  'concept', 'sample',
  'quantity', 'text', 'formula',
];
