/**
 * Zod introspection for schema-driven forms: unwrap modifiers, build default
 * values, collect issues by path. Works on the contract schemas as-is.
 */
import { z } from 'zod';

export type Path = (string | number)[];
export const pathKey = (p: Path) => p.join('.');

export interface Unwrapped {
  base: z.ZodTypeAny;
  optional: boolean;
  nullable: boolean;
}

/** Strip optional / nullable / default / effects / pipeline / lazy / branded wrappers. */
export function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let s = schema;
  let optional = false;
  let nullable = false;
  for (let i = 0; i < 20; i++) {
    if (s instanceof z.ZodOptional) {
      optional = true;
      s = s._def.innerType;
    } else if (s instanceof z.ZodNullable) {
      nullable = true;
      s = s._def.innerType;
    } else if (s instanceof z.ZodDefault) {
      optional = true;
      s = s._def.innerType;
    } else if (s instanceof z.ZodEffects) {
      s = s._def.schema;
    } else if (s instanceof z.ZodPipeline) {
      s = s._def.in;
    } else if (s instanceof z.ZodLazy) {
      s = s._def.getter();
    } else if (s instanceof z.ZodBranded) {
      s = s._def.type;
    } else if (s instanceof z.ZodCatch) {
      s = s._def.innerType;
    } else break;
  }
  return { base: s, optional, nullable };
}

/** Peel only effects/lazy (keeps optional): the schema identity used by registry lookups. */
export function core(schema: z.ZodTypeAny): z.ZodTypeAny[] {
  const out: z.ZodTypeAny[] = [schema];
  let s = schema;
  for (let i = 0; i < 20; i++) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable || s instanceof z.ZodDefault) s = s._def.innerType;
    else if (s instanceof z.ZodEffects) s = s._def.schema;
    else if (s instanceof z.ZodLazy) s = s._def.getter();
    else break;
    out.push(s);
  }
  return out;
}

const LANG_KEYS = ['ky', 'ru', 'en'];

/** A `LocalizedSchema`-shaped object: exactly { ky, ru, en } strings. */
export function isLocalizedSchema(schema: z.ZodTypeAny): boolean {
  const { base } = unwrap(schema);
  if (!(base instanceof z.ZodObject)) return false;
  const keys = Object.keys(base.shape);
  return keys.length === 3 && LANG_KEYS.every((k) => keys.includes(k) && unwrap(base.shape[k]).base instanceof z.ZodString);
}

function minLength(arr: z.ZodArray<z.ZodTypeAny>): number {
  return arr._def.minLength?.value ?? 0;
}

function numberMin(n: z.ZodNumber): number | undefined {
  for (const c of n._def.checks) if (c.kind === 'min') return c.value;
  return undefined;
}

/** A sensible empty value for a schema (drafts are allowed to be invalid until saved). */
export function defaultFor(schema: z.ZodTypeAny, opts: { includeOptional?: boolean } = {}): unknown {
  const { base, optional, nullable } = unwrap(schema);
  if (optional && !opts.includeOptional) return undefined;
  if (nullable && !opts.includeOptional) return null;
  if (isLocalizedSchema(base)) return { ky: '', ru: '', en: '' };
  if (base instanceof z.ZodObject) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(base.shape as Record<string, z.ZodTypeAny>)) {
      const d = defaultFor(v);
      if (d !== undefined) out[k] = d;
    }
    return out;
  }
  if (base instanceof z.ZodString) return '';
  if (base instanceof z.ZodNumber) return Math.max(0, numberMin(base) ?? 0);
  if (base instanceof z.ZodBoolean) return false;
  if (base instanceof z.ZodArray) return Array.from({ length: minLength(base) }, () => defaultFor(base.element, { includeOptional: true }));
  if (base instanceof z.ZodEnum) return base.options[0];
  if (base instanceof z.ZodNativeEnum) return Object.values(base.enum)[0];
  if (base instanceof z.ZodLiteral) return base.value;
  if (base instanceof z.ZodRecord) return {};
  if (base instanceof z.ZodTuple) return (base.items as z.ZodTypeAny[]).map((i) => defaultFor(i, { includeOptional: true }));
  if (base instanceof z.ZodDiscriminatedUnion) {
    const first = [...base.optionsMap.values()][0] as z.ZodTypeAny;
    return defaultFor(first, { includeOptional: true });
  }
  if (base instanceof z.ZodUnion) return defaultFor(base.options[0], { includeOptional: true });
  return undefined;
}

export interface FormIssue {
  path: Path;
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

export type IssueMap = Map<string, FormIssue[]>;

export function collectIssues(schema: z.ZodTypeAny, value: unknown): FormIssue[] {
  const r = schema.safeParse(value);
  if (r.success) return [];
  return r.error.issues.map((i) => {
    const params: Record<string, unknown> = {};
    if ('minimum' in i) params.min = i.minimum;
    if ('maximum' in i) params.max = i.maximum;
    if ('received' in i) params.received = i.received;
    return { path: i.path, code: i.code === 'invalid_type' && params.received === 'undefined' ? 'required' : i.code, message: i.message, params };
  });
}

export function issueMap(issues: readonly FormIssue[]): IssueMap {
  const m: IssueMap = new Map();
  for (const i of issues) {
    const k = pathKey(i.path);
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return m;
}

export function getAt(obj: unknown, path: Path): unknown {
  let cur = obj;
  for (const p of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

/** Immutable set (creates objects/arrays along the way; `undefined` deletes object keys). */
export function setAt<T>(obj: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const src = (obj ?? (typeof head === 'number' ? [] : {})) as Record<string | number, unknown>;
  const next = (Array.isArray(src) ? [...src] : { ...src }) as Record<string | number, unknown>;
  const child = setAt(src[head], rest, value);
  if (child === undefined && !Array.isArray(next)) delete next[head];
  else next[head] = child;
  return next as T;
}

/** Human fallback label for a field key: `durationMin` → `Duration min`. */
export const humanize = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

/**
 * PATCH bodies (contract 0.3.0): an optional field the patch schema also
 * accepts as `null` is removed by sending `null` — JSON cannot carry
 * `undefined`, so a field the editor cleared would otherwise be kept by the
 * server's merge. `data` is the whole edited record; with `base` (the stored
 * record) only fields that existed there are nulled.
 */
export function withRemovals<T extends Record<string, unknown>>(patchSchema: z.ZodTypeAny | undefined, data: T, base?: Record<string, unknown>): T {
  const obj = patchSchema ? core(patchSchema).find((s): s is z.AnyZodObject => s instanceof z.ZodObject) : undefined;
  if (!obj) return data;
  const out: Record<string, unknown> = { ...data };
  for (const [k, s] of Object.entries(obj.shape as z.ZodRawShape)) {
    const u = unwrap(s);
    if (!u.optional || !u.nullable || data[k] !== undefined) continue;
    if (base && base[k] === undefined) continue;
    out[k] = null;
  }
  return out as T;
}
