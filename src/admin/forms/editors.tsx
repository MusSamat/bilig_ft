/**
 * Built-in structural editors + the `SchemaField` dispatcher. Every field
 * shows the contract's own validation issues for its path.
 */
import { useId, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { LocalizedSchema } from '@bilig/content-model';
import type { TFn } from '../i18n';
import { Icon } from '../lib/icons';
import { EditorRegistry, type EditorProps, type FormCtx } from './registry';
import { defaultFor, humanize, isLocalizedSchema, pathKey, unwrap, type FormIssue, type Path } from './zod-utils';

// ---------------------------------------------------------------------------
// Labels & messages
// ---------------------------------------------------------------------------

export const fieldLabel = (t: TFn, key: string | undefined): string =>
  key ? t(`fields.${key}`, { defaultValue: humanize(key) }) : '';

const KNOWN_MESSAGES: Record<string, string> = {
  'Localized value must have at least one language': 'localized_empty',
  'Invalid key': 'invalid_key',
  'Expected semver': 'invalid_semver',
  'gltf scene requires an asset': 'scene_asset',
  'scene requires params or asset': 'scene_params',
  'sampleSize exceeds itemKeys': 'sample_size',
  'endsAt must be after startsAt': 'ends_after_starts',
  'Invalid property type key': 'invalid_prop_key',
  'Invalid plugin id': 'invalid_plugin',
  'Invalid relative path': 'invalid_rel_path',
  'Expected sha256 hex': 'invalid_hash',
};

export function issueText(t: TFn, issue: FormIssue): string {
  const known = KNOWN_MESSAGES[issue.message];
  return t(`validation.${known ?? issue.code}`, { ...issue.params, defaultValue: issue.message });
}

const LONG_TEXT = new Set(['description', 'text', 'body', 'prompt', 'explanation', 'correction', 'goal', 'teacherNote', 'altText', 'funFact', 'analogy', 'question', 'reason', 'message', 'content']);

export const fieldKeyOf = (path: Path): string | undefined => {
  for (let i = path.length - 1; i >= 0; i--) if (typeof path[i] === 'string') return path[i] as string;
  return undefined;
};

export function FieldErrors({ path, ctx }: { path: Path; ctx: FormCtx }) {
  const list = ctx.issues.get(pathKey(path));
  if (!list?.length) return null;
  return (
    <ul className="adm-field-errors" role="alert">
      {list.map((i, n) => (
        <li key={n}>{issueText(ctx.t, i)}</li>
      ))}
    </ul>
  );
}

export function Field({ label, path, ctx, children, htmlFor }: { label: ReactNode; path: Path; ctx: FormCtx; children: ReactNode; htmlFor?: string }) {
  const bad = ctx.issues.has(pathKey(path));
  return (
    <div className={`adm-field${bad ? ' adm-field--invalid' : ''}`} data-path={pathKey(path)}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      <FieldErrors path={path} ctx={ctx} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function SchemaField(props: { schema: z.ZodTypeAny; value: unknown; onChange(v: unknown): void; path: Path; ctx: FormCtx; label?: ReactNode }) {
  const { schema, path, ctx } = props;
  if (ctx.hidden?.has(pathKey(path))) return null;
  const fieldKey = fieldKeyOf(path);
  const entry = ctx.registry.resolve(schema, { path, fieldKey });
  const Comp = entry?.component ?? JsonEditor;
  const label = props.label ?? (typeof path[path.length - 1] === 'string' ? fieldLabel(ctx.t, fieldKey) : '');
  return <Comp schema={schema} value={props.value} onChange={props.onChange} path={path} fieldKey={fieldKey} label={label} ctx={ctx} />;
}

// ---------------------------------------------------------------------------
// Primitive editors
// ---------------------------------------------------------------------------

function StringEditor({ schema, value, onChange, path, fieldKey, label, ctx }: EditorProps<string | undefined>) {
  const id = useId();
  const { optional, base } = unwrap(schema);
  const max = (base as z.ZodString)._def.checks?.find((c) => c.kind === 'max') as { value: number } | undefined;
  const long = (fieldKey && LONG_TEXT.has(fieldKey)) || (max?.value ?? 0) >= 1000;
  const suggestions = fieldKey ? ctx.suggest?.[fieldKey] : undefined;
  const set = (v: string) => onChange(optional && v === '' ? undefined : v);
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      {long ? (
        <textarea id={id} value={value ?? ''} readOnly={ctx.readOnly} rows={3} onChange={(e) => set(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value ?? ''} readOnly={ctx.readOnly} list={suggestions ? `${id}-list` : undefined} onChange={(e) => set(e.target.value)} />
      )}
      {suggestions && (
        <datalist id={`${id}-list`}>
          {suggestions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </datalist>
      )}
    </Field>
  );
}

/** ISO date-time strings (`z.string().datetime()`): a local date-time picker that writes ISO with offset. */
function DateTimeEditor({ schema, value, onChange, path, label, ctx }: EditorProps<string | undefined>) {
  const id = useId();
  const { optional } = unwrap(schema);
  const local = value ? toLocalInput(value) : '';
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <input
        id={id}
        type="datetime-local"
        value={local}
        readOnly={ctx.readOnly}
        onChange={(e) => {
          const d = new Date(e.target.value);
          if (!e.target.value || Number.isNaN(d.getTime())) onChange(optional ? undefined : '');
          else onChange(d.toISOString());
        }}
      />
    </Field>
  );
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const isDateTime = (s: z.ZodTypeAny) => {
  const { base } = unwrap(s);
  return base instanceof z.ZodString && base._def.checks.some((c) => c.kind === 'datetime');
};

function NumberEditor({ schema, value, onChange, path, label, ctx }: EditorProps<number | undefined>) {
  const id = useId();
  const { optional, base } = unwrap(schema);
  const isInt = (base as z.ZodNumber).isInt;
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <input
        id={id}
        type="number"
        step={isInt ? 1 : 'any'}
        value={value ?? ''}
        readOnly={ctx.readOnly}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(optional ? undefined : (0 as number));
          else onChange(Number(raw));
        }}
      />
    </Field>
  );
}

function BooleanEditor({ value, onChange, path, label, ctx }: EditorProps<boolean | undefined>) {
  const id = useId();
  return (
    <div className="adm-field adm-field--check" data-path={pathKey(path)}>
      <input id={id} type="checkbox" className="adm-switch" checked={!!value} disabled={ctx.readOnly} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
      <FieldErrors path={path} ctx={ctx} />
    </div>
  );
}

function EnumEditor({ schema, value, onChange, path, label, ctx }: EditorProps<string | undefined>) {
  const id = useId();
  const { base, optional } = unwrap(schema);
  const options: string[] = base instanceof z.ZodEnum ? base.options : Object.values((base as z.ZodNativeEnum<z.EnumLike>).enum).map(String);
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <select id={id} value={value ?? ''} disabled={ctx.readOnly} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}>
        {optional && <option value="">—</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {ctx.t(`enum.${o}`, { defaultValue: o })}
          </option>
        ))}
      </select>
    </Field>
  );
}

function LiteralEditor({ value, path, label, ctx }: EditorProps) {
  return (
    <Field label={label} path={path} ctx={ctx}>
      <code>{String(value)}</code>
    </Field>
  );
}

/** ky / ru / en side by side (TZ: all strings on 3 languages). */
export function LocalizedEditor({ schema, value, onChange, path, fieldKey, label, ctx }: EditorProps<{ ky: string; ru: string; en: string } | undefined>) {
  const id = useId();
  const { optional } = unwrap(schema);
  const v = value ?? { ky: '', ru: '', en: '' };
  const long = !!fieldKey && LONG_TEXT.has(fieldKey);
  const set = (lang: 'ky' | 'ru' | 'en', s: string) => {
    const next = { ...v, [lang]: s };
    onChange(optional && !next.ky && !next.ru && !next.en ? undefined : next);
  };
  return (
    <fieldset className="adm-localized" data-path={pathKey(path)}>
      <legend>{label}</legend>
      {(['ky', 'ru', 'en'] as const).map((l) => (
        <div key={l} className="adm-localized__row">
          <label htmlFor={`${id}-${l}`} className="adm-lang-tag">
            {l}
          </label>
          {long ? (
            <textarea id={`${id}-${l}`} rows={2} value={v[l]} readOnly={ctx.readOnly} onChange={(e) => set(l, e.target.value)} />
          ) : (
            <input id={`${id}-${l}`} type="text" value={v[l]} readOnly={ctx.readOnly} onChange={(e) => set(l, e.target.value)} />
          )}
        </div>
      ))}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Structured editors
// ---------------------------------------------------------------------------

function ObjectEditor({ schema, value, onChange, path, label, ctx }: EditorProps<Record<string, unknown> | undefined>) {
  const { base } = unwrap(schema);
  const shape = (base as z.ZodObject<z.ZodRawShape>).shape as Record<string, z.ZodTypeAny>;
  const v = value ?? {};
  const body = Object.entries(shape).map(([k, s]) => (
    <SchemaField
      key={k}
      schema={s}
      value={v[k]}
      path={[...path, k]}
      ctx={ctx}
      onChange={(nv) => {
        const next = { ...v };
        if (nv === undefined) delete next[k];
        else next[k] = nv;
        onChange(next);
      }}
    />
  ));
  if (!path.length) return <div className="adm-object">{body}<FieldErrors path={path} ctx={ctx} /></div>;
  return (
    <fieldset className="adm-object" data-path={pathKey(path)}>
      {label ? <legend>{label}</legend> : null}
      {body}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

function ArrayEditor({ schema, value, onChange, path, label, ctx }: EditorProps<unknown[] | undefined>) {
  const { base } = unwrap(schema);
  const el = (base as z.ZodArray<z.ZodTypeAny>).element;
  const list = value ?? [];
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="adm-array" data-path={pathKey(path)}>
      <legend>{label}</legend>
      {list.map((item, i) => (
        <div key={i} className="adm-array__item">
          <SchemaField schema={el} value={item} path={[...path, i]} ctx={ctx} label={`#${i + 1}`} onChange={(nv) => onChange(list.map((x, n) => (n === i ? nv : x)))} />
          {!ctx.readOnly && (
            <div className="adm-array__tools">
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={ctx.t('form.moveUp')} onClick={() => move(i, -1)} disabled={i === 0}>
                <Icon id="up" size={18} />
              </button>
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={ctx.t('form.moveDown')} onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                <Icon id="down" size={18} />
              </button>
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={ctx.t('form.remove')} onClick={() => onChange(list.filter((_, n) => n !== i))}>
                <Icon id="x" size={18} />
              </button>
            </div>
          )}
        </div>
      ))}
      {!ctx.readOnly && (
        <button type="button" className="adm-btn adm-btn--small" onClick={() => onChange([...list, defaultFor(el, { includeOptional: true })])}>
          <Icon id="plus" size={16} />
            {ctx.t('form.add')}
        </button>
      )}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

/** Array of strings (keys, masks, stop-topics): chips with suggestions. */
export function TagsEditor({ schema, value, onChange, path, fieldKey, label, ctx }: EditorProps<string[] | undefined>) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const { optional } = unwrap(schema);
  const list = value ?? [];
  const suggestions = fieldKey ? ctx.suggest?.[fieldKey] : undefined;
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !list.includes(s));
    if (parts.length) onChange([...list, ...parts]);
    setDraft('');
  };
  const labelOf = (v: string) => suggestions?.find((s) => s.value === v)?.label;
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <div className="adm-tags">
        {list.map((tag, i) => (
          <span key={tag + i} className="adm-tag" title={labelOf(tag)}>
            {tag}
            {!ctx.readOnly && (
              <button type="button" aria-label={`${ctx.t('form.remove')} ${tag}`} onClick={() => {
                const next = list.filter((_, n) => n !== i);
                onChange(optional && !next.length ? undefined : next);
              }}>
                <Icon id="x" size={18} />
              </button>
            )}
          </span>
        ))}
        {!ctx.readOnly && (
          <input
            id={id}
            value={draft}
            placeholder={ctx.t('form.addTag')}
            list={suggestions ? `${id}-list` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
          />
        )}
        {suggestions && (
          <datalist id={`${id}-list`}>
            {suggestions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </datalist>
        )}
      </div>
      {list.map((_, i) => (
        <FieldErrors key={i} path={[...path, i]} ctx={ctx} />
      ))}
    </Field>
  );
}

function TupleEditor({ schema, value, onChange, path, label, ctx }: EditorProps<unknown[] | undefined>) {
  const { base, optional } = unwrap(schema);
  const items = (base as z.ZodTuple).items as z.ZodTypeAny[];
  const v = value ?? (defaultFor(base, { includeOptional: true }) as unknown[]);
  return (
    <fieldset className="adm-tuple" data-path={pathKey(path)}>
      <legend>{label}</legend>
      <div className="adm-tuple__row">
        {items.map((s, i) => (
          <SchemaField key={i} schema={s} value={v[i]} path={[...path, i]} ctx={ctx} label={['x', 'y', 'z'][i] ?? `#${i + 1}`} onChange={(nv) => onChange(v.map((x, n) => (n === i ? nv : x)))} />
        ))}
        {optional && value !== undefined && !ctx.readOnly && (
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => onChange(undefined)}>
            {ctx.t('form.clear')}
          </button>
        )}
      </div>
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

function RecordEditor({ schema, value, onChange, path, label, ctx }: EditorProps<Record<string, unknown> | undefined>) {
  const [newKey, setNewKey] = useState('');
  const { base } = unwrap(schema);
  const valSchema = (base as z.ZodRecord).valueSchema as z.ZodTypeAny;
  const v = value ?? {};
  return (
    <fieldset className="adm-record" data-path={pathKey(path)}>
      <legend>{label}</legend>
      {Object.entries(v).map(([k, item]) => (
        <div key={k} className="adm-array__item">
          <SchemaField schema={valSchema} value={item} path={[...path, k]} ctx={ctx} label={<code>{k}</code>} onChange={(nv) => onChange({ ...v, [k]: nv })} />
          {!ctx.readOnly && (
            <div className="adm-array__tools">
              <button type="button" className="adm-btn adm-btn--ghost" aria-label={`${ctx.t('form.remove')} ${k}`} onClick={() => {
                const next = { ...v };
                delete next[k];
                onChange(next);
              }}>
                <Icon id="x" size={18} />
              </button>
            </div>
          )}
        </div>
      ))}
      {!ctx.readOnly && (
        <div className="adm-inline">
          <input value={newKey} aria-label={ctx.t('form.newKey')} placeholder={ctx.t('form.newKey')} list={ctx.suggest?.[`${fieldKeyOf(path)}.$key`] ? `${pathKey(path)}-keys` : undefined} onChange={(e) => setNewKey(e.target.value.trim())} />
          {ctx.suggest?.[`${fieldKeyOf(path)}.$key`] && (
            <datalist id={`${pathKey(path)}-keys`}>
              {ctx.suggest[`${fieldKeyOf(path)}.$key`].map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </datalist>
          )}
          <button type="button" className="adm-btn adm-btn--small" disabled={!newKey || newKey in v} onClick={() => {
            onChange({ ...v, [newKey]: defaultFor(valSchema, { includeOptional: true }) });
            setNewKey('');
          }}>
            <Icon id="plus" size={16} />
            {ctx.t('form.add')}
          </button>
        </div>
      )}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

function DiscriminatedUnionEditor({ schema, value, onChange, path, label, ctx }: EditorProps<Record<string, unknown> | undefined>) {
  const id = useId();
  const { base } = unwrap(schema);
  const u = base as z.ZodDiscriminatedUnion<string, z.ZodObject<z.ZodRawShape>[]>;
  const disc = u.discriminator;
  const options = [...u.optionsMap.keys()].map(String);
  const cur = (value?.[disc] as string | undefined) ?? options[0];
  const variant = u.optionsMap.get(cur) as z.ZodObject<z.ZodRawShape> | undefined;
  const Custom = ctx.registry.variantEditor(schema, cur);
  const switchTo = (next: string) => {
    const nv = u.optionsMap.get(next) as z.ZodObject<z.ZodRawShape>;
    const fresh = defaultFor(nv, { includeOptional: true }) as Record<string, unknown>;
    // keep fields shared by both variants (prompt, explanation …)
    const keep = Object.fromEntries(Object.entries(value ?? {}).filter(([k]) => k !== disc && k in nv.shape));
    onChange({ ...fresh, ...keep, [disc]: next });
  };
  return (
    <fieldset className="adm-union" data-path={pathKey(path)}>
      {label ? <legend>{label}</legend> : null}
      <div className="adm-field">
        <label htmlFor={id}>{fieldLabel(ctx.t, disc)}</label>
        <select id={id} value={cur} disabled={ctx.readOnly} onChange={(e) => switchTo(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {ctx.t(`enum.${o}`, { defaultValue: o })}
            </option>
          ))}
        </select>
      </div>
      {Custom ? (
        <Custom schema={variant!} value={value} onChange={onChange} path={path} label="" ctx={ctx} />
      ) : (
        variant &&
        Object.entries(variant.shape as Record<string, z.ZodTypeAny>)
          .filter(([k]) => k !== disc)
          .map(([k, s]) => (
            <SchemaField
              key={`${cur}.${k}`}
              schema={s}
              value={value?.[k]}
              path={[...path, k]}
              ctx={ctx}
              onChange={(nv) => {
                const next = { ...(value ?? {}), [disc]: cur };
                if (nv === undefined) delete next[k];
                else next[k] = nv;
                onChange(next);
              }}
            />
          ))
      )}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

/** Optional structured value: "add" button when absent, "remove" when present. */
function OptionalEditor(props: EditorProps) {
  const { schema, value, onChange, path, label, ctx } = props;
  const { base } = unwrap(schema);
  if (value === undefined || value === null) {
    return (
      <div className="adm-field adm-field--optional" data-path={pathKey(path)}>
        <span>{label}</span>
        {!ctx.readOnly && (
          <button type="button" className="adm-btn adm-btn--small" onClick={() => onChange(defaultFor(base, { includeOptional: true }))}>
            <Icon id="plus" size={16} />
            {ctx.t('form.add')}
          </button>
        )}
        <FieldErrors path={path} ctx={ctx} />
      </div>
    );
  }
  const entry = ctx.registry.resolve(base, { path, fieldKey: props.fieldKey });
  const Comp = entry?.component ?? JsonEditor;
  return (
    <div className="adm-optional">
      <Comp {...props} schema={base} />
      {!ctx.readOnly && (
        <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => onChange(undefined)}>
          {ctx.t('form.removeBlock', { name: typeof label === 'string' ? label : '' })}
        </button>
      )}
    </div>
  );
}

/** Fallback for `unknown`, `any` and plain unions: JSON text. */
export function JsonEditor({ value, onChange, path, label, ctx }: EditorProps) {
  const id = useId();
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const [bad, setBad] = useState(false);
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <textarea
        id={id}
        className="adm-mono"
        rows={4}
        value={text}
        readOnly={ctx.readOnly}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            setBad(false);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(text));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad && <p className="adm-field-errors">{ctx.t('validation.json')}</p>}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Default registry
// ---------------------------------------------------------------------------

const is = <T extends z.ZodTypeAny>(cls: new (...a: never[]) => T) => (s: z.ZodTypeAny) => unwrap(s).base instanceof cls;

export function builtinRegistry(): EditorRegistry {
  const r = new EditorRegistry();
  r.register({ id: 'string', match: is(z.ZodString), component: StringEditor });
  r.register({ id: 'datetime', priority: 2, match: isDateTime, component: DateTimeEditor });
  r.register({ id: 'number', match: is(z.ZodNumber), component: NumberEditor });
  r.register({ id: 'boolean', match: is(z.ZodBoolean), component: BooleanEditor });
  r.register({ id: 'enum', match: (s) => is(z.ZodEnum)(s) || is(z.ZodNativeEnum)(s), component: EnumEditor });
  r.register({ id: 'literal', match: is(z.ZodLiteral), component: LiteralEditor });
  r.register({ id: 'object', match: is(z.ZodObject), component: ObjectEditor });
  r.register({ id: 'array', match: is(z.ZodArray), component: ArrayEditor });
  r.register({
    id: 'tags',
    priority: 1,
    match: (s) => {
      const { base } = unwrap(s);
      return base instanceof z.ZodArray && (unwrap(base.element).base instanceof z.ZodString);
    },
    component: TagsEditor,
  });
  r.register({ id: 'tuple', match: is(z.ZodTuple), component: TupleEditor });
  r.register({ id: 'record', match: is(z.ZodRecord), component: RecordEditor });
  r.register({ id: 'union', match: is(z.ZodDiscriminatedUnion), component: DiscriminatedUnionEditor });
  r.register({ id: 'json', match: (s) => is(z.ZodUnknown)(s) || is(z.ZodAny)(s) || is(z.ZodUnion)(s), component: JsonEditor });
  r.register({ id: 'localized', priority: 5, match: (s) => isLocalizedSchema(s), component: LocalizedEditor });
  r.forSchema(LocalizedSchema, LocalizedEditor, 'localized-schema');
  r.register({
    id: 'optional',
    priority: 10,
    match: (s) => {
      const { base, optional, nullable } = unwrap(s);
      if (!optional && !nullable) return false;
      if (isLocalizedSchema(base)) return false;
      return base instanceof z.ZodObject || base instanceof z.ZodDiscriminatedUnion || (base instanceof z.ZodArray && !(unwrap(base.element).base instanceof z.ZodString)) || base instanceof z.ZodRecord;
    },
    component: OptionalEditor,
  });
  return r;
}

/** Shared registry the modules extend (`registerAdminEditors`). */
export const adminRegistry: EditorRegistry = builtinRegistry().child();
