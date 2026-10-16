/**
 * Domain editors registered on the shared admin registry: hue (with light /
 * dark preview and AA check), icon picker, typed concept properties, scene
 * spec (plugin registry), camera («сохранить текущий вид»).
 */
import { useId } from 'react';
import { z } from 'zod';
import {
  CameraSchema,
  ConceptPropSchema,
  KNOWN_SCENE_PLUGINS,
  LocalizedSchema,
  PROPERTY_TYPES,
  SceneSpecSchema,
  type Camera,
  type ConceptProp,
} from '@bilig/content-model';
import { contrastChecks, tokensFromHue, type Theme } from '../lib/hue';
import { ICON_SET, Icon } from '../lib/icons';
import { usePreviewBridge } from '../lib/preview-bridge';
import { Field, FieldErrors, JsonEditor, LocalizedEditor, SchemaField, adminRegistry, fieldLabel } from './editors';
import { propertyEditors, registerScenePlugin, scenePlugins, type EditorProps, type FormCtx } from './registry';
import { pathKey } from './zod-utils';

// ---------------------------------------------------------------------------
// Hue
// ---------------------------------------------------------------------------

/** A miniature Workbench screen for one hue + theme, built from the client tokens. */
export function HuePreview({ hue, theme, ctx }: { hue: number; theme: Theme; ctx: Pick<FormCtx, 't'> }) {
  const tk = tokensFromHue(hue, theme);
  const checks = contrastChecks(tk);
  const bg = `radial-gradient(420px 260px at 85% -5%, ${tk.g1}, transparent 65%), radial-gradient(360px 260px at -5% 60%, ${tk.g2}, transparent 60%), linear-gradient(160deg, ${tk.g3}, ${tk.g4})`;
  return (
    <figure className="adm-hue-preview" data-theme={theme} style={{ background: bg, color: tk.ink }}>
      <figcaption className="adm-hue-preview__cap">
        <Icon id={theme === 'dark' ? 'moon' : 'sun'} size={16} />
        {ctx.t(`hue.${theme}`)}
      </figcaption>
      <div className="adm-hue-preview__card" style={{ background: tk.panel, borderColor: tk.edge, boxShadow: tk.sh }}>
        <strong className="adm-hue-preview__title">{ctx.t('hue.sampleTitle')}</strong>
        <p style={{ color: tk.muted }}>{ctx.t('hue.sampleMuted')}</p>
        <p style={{ color: tk.accent, fontWeight: 600 }}>{ctx.t('hue.sampleLink')}</p>
        <div className="adm-hue-preview__row">
          <span className="adm-hue-preview__btn" style={{ background: tk.accent, color: tk.on, outline: `3px solid ${tk.accent}`, outlineOffset: 2 }}>
            {ctx.t('hue.sampleButton')}
          </span>
          <span className="adm-hue-preview__chip" style={{ background: tk.chip, borderColor: tk.line }}>
            <i style={{ background: tk.accent }} />
            {ctx.t('hue.sampleChip')}
          </span>
          <span className="adm-hue-preview__soft" style={{ background: tk.soft, color: tk.accent }}>
            {ctx.t('hue.sampleSoft')}
          </span>
        </div>
        <div className="adm-hue-preview__swatches" aria-hidden="true">
          {(['g1', 'g2', 'g3', 'g4', 'accent', 'ink'] as const).map((k) => (
            <i key={k} title={k} style={{ background: tk[k] }} />
          ))}
        </div>
      </div>
      <ul className="adm-contrast">
        {checks.map((c) => (
          <li key={c.pair} className={c.pass ? 'is-pass' : 'is-fail'}>
            <span>{ctx.t(`hue.pair.${c.pair}`)}</span>
            <span className="adm-contrast__ratio">{c.ratio.toFixed(2)}:1</span>
            <span className={`adm-badge adm-badge--${c.pass ? 'ok' : 'error'}`}>
              <Icon id={c.pass ? 'check' : 'warn'} size={14} />
              {c.pass ? ctx.t('hue.pass', { min: c.required }) : ctx.t('hue.fail', { min: c.required })}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function HueEditor({ value, onChange, path, label, ctx }: EditorProps<number | undefined>) {
  const id = useId();
  const hue = value ?? 0;
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <div className="adm-hue">
        <input
          id={id}
          className="adm-hue__range"
          type="range"
          min={0}
          max={359}
          value={hue}
          disabled={ctx.readOnly}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-describedby={`${id}-n`}
          style={{ ['--h' as string]: hue }}
        />
        <input id={`${id}-n`} className="adm-hue__num" type="number" min={0} max={359} value={hue} readOnly={ctx.readOnly} aria-label={String(label)} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="adm-swatch" style={{ background: tokensFromHue(hue, 'light').accent }} />
      </div>
      {path.length === 1 && (
        <div className="adm-hue-previews">
          <HuePreview hue={hue} theme="light" ctx={ctx} />
          <HuePreview hue={hue} theme="dark" ctx={ctx} />
        </div>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Icon picker
// ---------------------------------------------------------------------------

function IconEditor({ value, onChange, path, label, ctx }: EditorProps<string | undefined>) {
  const id = useId();
  return (
    <Field label={label} path={path} ctx={ctx} htmlFor={id}>
      <div className="adm-icon-grid" role="radiogroup" aria-label={String(label)}>
        {ICON_SET.map((ic) => (
          <button key={ic} type="button" role="radio" aria-checked={value === ic} title={ic} className={`adm-icon-option${value === ic ? ' is-active' : ''}`} disabled={ctx.readOnly} onClick={() => onChange(ic)}>
            <Icon id={ic} />
          </button>
        ))}
      </div>
      <input id={id} type="text" value={value ?? ''} readOnly={ctx.readOnly} onChange={(e) => onChange(e.target.value)} aria-label={ctx.t('fields.iconId')} />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Typed concept property (W-30): property type from the dictionary decides the kind.
// ---------------------------------------------------------------------------

function ConceptPropEditor({ value, onChange, path, ctx }: EditorProps<ConceptProp | undefined>) {
  const id = useId();
  const prop = value ?? ({ kind: 'text', type: 'function', value: { ky: '', ru: '', en: '' } } as ConceptProp);
  const lang = ctx.lang ?? 'ru';
  const setType = (type: string) => {
    const def = PROPERTY_TYPES[type];
    const kind = def?.valueKind ?? prop.kind;
    if (kind === prop.kind) return onChange({ ...prop, type } as ConceptProp);
    if (kind === 'quantity') return onChange({ kind, type, value: 0 });
    if (kind === 'formula') return onChange({ kind, type, value: '' } as unknown as ConceptProp);
    return onChange({ kind: 'text', type, value: { ky: '', ru: '', en: '' } });
  };
  const Custom = propertyEditors.get(prop.type);
  const unit = PROPERTY_TYPES[prop.type]?.unit;
  return (
    <fieldset className="adm-prop" data-path={pathKey(path)}>
      <div className="adm-inline">
        <div className="adm-field">
          <label htmlFor={id}>{fieldLabel(ctx.t, 'type')}</label>
          <input id={id} list={`${id}-types`} value={prop.type} readOnly={ctx.readOnly} onChange={(e) => setType(e.target.value)} />
          <datalist id={`${id}-types`}>
            {Object.values(PROPERTY_TYPES).map((d) => (
              <option key={d.key} value={d.key}>
                {d.label[lang]}
              </option>
            ))}
          </datalist>
        </div>
        <span className="adm-badge">{ctx.t(`enum.${prop.kind}`, { defaultValue: prop.kind })}</span>
      </div>
      {Custom ? (
        <Custom value={prop} onChange={(v) => onChange(v as ConceptProp)} ctx={ctx} />
      ) : prop.kind === 'quantity' ? (
        <div className="adm-inline">
          {(['value', 'max'] as const).map((k) => (
            <SchemaField key={k} schema={k === 'value' ? z.number() : z.number().optional()} value={prop[k]} path={[...path, k]} ctx={ctx} onChange={(v) => onChange({ ...prop, [k]: v } as ConceptProp)} />
          ))}
          <SchemaField schema={z.string().optional()} value={prop.unit} path={[...path, 'unit']} ctx={ctx} label={`${fieldLabel(ctx.t, 'unit')}${unit ? ` (${unit})` : ''}`} onChange={(v) => onChange({ ...prop, unit: v as string | undefined })} />
          <SchemaField schema={z.boolean().optional()} value={prop.approx} path={[...path, 'approx']} ctx={ctx} onChange={(v) => onChange({ ...prop, approx: (v as boolean) || undefined })} />
        </div>
      ) : prop.kind === 'formula' ? (
        <SchemaField schema={z.string()} value={prop.value} path={[...path, 'value']} ctx={ctx} label={fieldLabel(ctx.t, 'formula')} onChange={(v) => onChange({ ...prop, value: v as string })} />
      ) : (
        <LocalizedEditor schema={LocalizedSchema} value={prop.value} path={[...path, 'value']} ctx={ctx} label={fieldLabel(ctx.t, 'value')} onChange={(v) => onChange({ ...prop, value: v ?? { ky: '', ru: '', en: '' } } as ConceptProp)} />
      )}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Camera: «сохранить текущий вид» from the preview (extension point)
// ---------------------------------------------------------------------------

function CameraEditor(props: EditorProps<Camera | undefined>) {
  const getCamera = usePreviewBridge((s) => s.bridge.getCamera);
  const { value, onChange, path, label, ctx } = props;
  const inner = (CameraSchema as z.ZodObject<z.ZodRawShape>).shape as Record<string, z.ZodTypeAny>;
  return (
    <fieldset className="adm-object" data-path={pathKey(path)}>
      <legend>{label}</legend>
      <button
        type="button"
        className="adm-btn adm-btn--small"
        disabled={!getCamera || ctx.readOnly}
        title={getCamera ? undefined : ctx.t('preview.needsViewer')}
        onClick={() => {
          const cam = getCamera?.();
          if (cam) onChange(cam);
        }}
      >
        <Icon id="camera" size={16} />
        {ctx.t('preview.saveView')}
      </button>
      {value ? (
        <>
          {Object.entries(inner).map(([k, s]) => (
            <SchemaField key={k} schema={s} value={value[k as keyof Camera]} path={[...path, k]} ctx={ctx} onChange={(nv) => onChange({ ...value, [k]: nv } as Camera)} />
          ))}
          {!ctx.readOnly && (
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => onChange(undefined)}>
              {ctx.t('form.clear')}
            </button>
          )}
        </>
      ) : (
        !ctx.readOnly && (
          <button type="button" className="adm-btn adm-btn--small" onClick={() => onChange({ position: [0, 0, 5], target: [0, 0, 0] })}>
            <Icon id="plus" size={16} />
            {ctx.t('form.add')}
          </button>
        )
      )}
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Scene spec (plugin registry)
// ---------------------------------------------------------------------------

function SceneSpecEditor({ value, onChange, path, label, ctx }: EditorProps<Record<string, unknown> | undefined>) {
  const id = useId();
  const v = value ?? { plugin: 'gltf', modes: [] };
  const plugin = String(v.plugin ?? '');
  const def = scenePlugins.get(plugin);
  const ids = [...new Set([...KNOWN_SCENE_PLUGINS, ...scenePlugins.keys()])];
  const set = (k: string, nv: unknown) => {
    const next = { ...v };
    if (nv === undefined) delete next[k];
    else next[k] = nv;
    onChange(next);
  };
  const ParamsEditor = def?.editor;
  const modeSuggest = { ...ctx.suggest, modes: (def?.modes ?? []).map((m) => ({ value: m })) };
  return (
    <fieldset className="adm-object" data-path={pathKey(path)}>
      <legend>{label}</legend>
      <Field label={fieldLabel(ctx.t, 'plugin')} path={[...path, 'plugin']} ctx={ctx} htmlFor={id}>
        <input id={id} list={`${id}-plugins`} value={plugin} readOnly={ctx.readOnly} onChange={(e) => set('plugin', e.target.value)} />
        <datalist id={`${id}-plugins`}>
          {ids.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      {(def?.usesAsset ?? plugin === 'gltf') ? (
        <SchemaField schema={z.string().optional()} value={v.asset} path={[...path, 'asset']} ctx={ctx} onChange={(nv) => set('asset', nv)} />
      ) : ParamsEditor ? (
        <ParamsEditor schema={def!.params ?? z.unknown()} value={v.params} path={[...path, 'params']} label={fieldLabel(ctx.t, 'params')} ctx={ctx} onChange={(nv: unknown) => set('params', nv)} />
      ) : def?.params ? (
        <SchemaField schema={def.params} value={v.params} path={[...path, 'params']} ctx={ctx} onChange={(nv) => set('params', nv)} />
      ) : (
        <JsonEditor schema={z.unknown()} value={v.params} path={[...path, 'params']} label={fieldLabel(ctx.t, 'params')} ctx={ctx} onChange={(nv) => set('params', nv)} />
      )}
      <CameraEditor schema={CameraSchema.optional()} value={v.camera as Camera | undefined} path={[...path, 'camera']} label={fieldLabel(ctx.t, 'camera')} ctx={ctx} onChange={(nv) => set('camera', nv)} />
      <SchemaField schema={z.array(z.string())} value={v.modes} path={[...path, 'modes']} ctx={{ ...ctx, suggest: modeSuggest }} onChange={(nv) => set('modes', nv ?? [])} />
      <FieldErrors path={path} ctx={ctx} />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------

let registered = false;

/** Register the domain editors and the known scene plugins once. */
export function registerAdminEditors() {
  if (registered) return;
  registered = true;
  const r = adminRegistry;
  r.forKey('hue', HueEditor, (s) => s instanceof z.ZodNumber || s instanceof z.ZodOptional || s instanceof z.ZodEffects);
  r.forKey('icon', IconEditor);
  r.forSchema(ConceptPropSchema, ConceptPropEditor, 'concept-prop');
  r.forSchema(CameraSchema, CameraEditor, 'camera');
  r.forSchema(SceneSpecSchema, SceneSpecEditor, 'scene');
  registerScenePlugin({ id: 'gltf', usesAsset: true, modes: ['whole', 'section', 'xray', 'labels'] });
  registerScenePlugin({ id: 'molecule', modes: ['ball-stick', 'spacefill', 'shells'] });
  registerScenePlugin({ id: 'crystal', modes: ['ball-stick', 'spacefill'] });
  registerScenePlugin({ id: 'geometry', modes: ['solid', 'wireframe'] });
  registerScenePlugin({ id: 'sim', modes: ['vectors', 'trace', 'energy', 'orbits'] });
}
