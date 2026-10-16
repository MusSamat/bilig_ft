/**
 * Editor registry (TZ §5 «Принцип масштаба»): forms are built from the same
 * Zod schemas as the API; a new property type, activity or scene plugin adds
 * its own editor here and nothing else changes.
 *
 * Resolution order for a field (highest priority wins, later registration
 * wins ties):
 *   100  exact schema identity            `registry.forSchema(LocalizedSchema, …)`
 *    60  discriminated-union variant      `registry.forVariant(ItemSchema, 'numeric', …)`
 *    50  field key                        `registry.forKey('hue', …)`
 *     0  structural built-ins             string / number / object / array / union …
 *
 * Domain registries ride on the same mechanism:
 *  - property types:  `registerPropertyEditor('molarMass', …)` (concept props)
 *  - scene plugins:   `registerScenePlugin({ id: 'molecule', params: z.object(…) })`
 *  - activities:      `registerActivity({ id: 'quiz', … })` (topic «Активности» tab)
 */
import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';
import type { TFn } from '../i18n';
import { core, type IssueMap, type Path } from './zod-utils';

export interface Suggestion {
  value: string;
  label?: string;
}

export interface FormCtx {
  t: TFn;
  registry: EditorRegistry;
  issues: IssueMap;
  readOnly?: boolean;
  /** Suggestions for key-like fields, by field key (`conceptKey`, `objectiveKeys` …). */
  suggest?: Record<string, Suggestion[]>;
  /** Content language for previews inside editors. */
  lang?: 'ky' | 'ru' | 'en';
  /** The whole form value (for cross-field editors). */
  root?: unknown;
  /** Paths (`a.b.0`) not rendered (immutable keys, server-managed status …). */
  hidden?: Set<string>;
}

export interface EditorProps<T = unknown> {
  schema: z.ZodTypeAny;
  value: T;
  onChange(value: T): void;
  path: Path;
  /** Field key (last path segment that is a string), used for labels. */
  fieldKey?: string;
  label: ReactNode;
  ctx: FormCtx;
}

export type Editor = ComponentType<EditorProps<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface MatchInfo {
  path: Path;
  fieldKey?: string;
}

export interface EditorEntry {
  id: string;
  priority: number;
  match(schema: z.ZodTypeAny, info: MatchInfo): boolean;
  component: Editor;
}

export class EditorRegistry {
  private entries: EditorEntry[] = [];
  private variants = new Map<z.ZodTypeAny, Map<string, Editor>>();

  constructor(private readonly parent?: EditorRegistry) {}

  register(entry: Omit<EditorEntry, 'priority'> & { priority?: number }): () => void {
    const e: EditorEntry = { priority: 0, ...entry };
    this.entries.push(e);
    return () => {
      this.entries = this.entries.filter((x) => x !== e);
    };
  }

  /** Editor for one exact schema instance (matched through optional/effects wrappers). */
  forSchema(schema: z.ZodTypeAny, component: Editor, id = 'schema'): () => void {
    const targets = core(schema);
    return this.register({ id, priority: 100, component, match: (s) => core(s).some((x) => targets.includes(x)) });
  }

  /** Editor for every field with this key (`icon`, `hue` …), optionally limited by a predicate. */
  forKey(key: string, component: Editor, when?: (schema: z.ZodTypeAny, info: MatchInfo) => boolean): () => void {
    return this.register({ id: `key:${key}`, priority: 50, component, match: (s, info) => info.fieldKey === key && (!when || when(s, info)) });
  }

  /** Editor for one variant of a discriminated union (replaces the generic variant fields). */
  forVariant(union: z.ZodTypeAny, discriminatorValue: string, component: Editor): () => void {
    const u = core(union).at(-1)!;
    const m = this.variants.get(u) ?? new Map<string, Editor>();
    m.set(discriminatorValue, component);
    this.variants.set(u, m);
    return () => m.delete(discriminatorValue);
  }

  variantEditor(union: z.ZodTypeAny, value: string): Editor | undefined {
    for (const u of core(union)) {
      const hit = this.variants.get(u)?.get(value);
      if (hit) return hit;
    }
    return this.parent?.variantEditor(union, value);
  }

  private all(): EditorEntry[] {
    return [...(this.parent?.all() ?? []), ...this.entries];
  }

  resolve(schema: z.ZodTypeAny, info: MatchInfo): EditorEntry | undefined {
    let best: EditorEntry | undefined;
    for (const e of this.all()) {
      if (!e.match(schema, info)) continue;
      if (!best || e.priority >= best.priority) best = e;
    }
    return best;
  }

  /** A child registry: local overrides on top of this one. */
  child(): EditorRegistry {
    return new EditorRegistry(this);
  }
}

// ---------------------------------------------------------------------------
// Domain extension points
// ---------------------------------------------------------------------------

export interface PropertyEditorProps {
  value: unknown;
  onChange(value: unknown): void;
  ctx: FormCtx;
}

/** Value editors for concept property types (`ConceptProp.type`), e.g. a formula editor. */
export const propertyEditors = new Map<string, ComponentType<PropertyEditorProps>>();
export function registerPropertyEditor(typeKey: string, component: ComponentType<PropertyEditorProps>): () => void {
  propertyEditors.set(typeKey, component);
  return () => propertyEditors.delete(typeKey);
}

export interface ScenePluginDef {
  id: string;
  /** Uses a package asset (`SceneSpec.asset`) instead of generator params. */
  usesAsset?: boolean;
  /** Schema of `SceneSpec.params`; the params editor is generated from it. */
  params?: z.ZodTypeAny;
  /** Mode ids the plugin offers for the «Вид модели» panel. */
  modes?: string[];
  /** Fully custom params editor (overrides the generated one). */
  editor?: Editor;
}

export const scenePlugins = new Map<string, ScenePluginDef>();
export function registerScenePlugin(def: ScenePluginDef): () => void {
  scenePlugins.set(def.id, def);
  return () => scenePlugins.delete(def.id);
}

export interface ActivityDef {
  id: string;
  /** i18n key of the title. */
  titleKey: string;
  /** Topic doc path the activity lives at. */
  path: Path;
  /** Edited inline in the «Активности» tab with a form generated from this schema. */
  schema?: z.ZodTypeAny;
  /** Or: its own admin screen under the topic (`topics/:id/<route>`). */
  route?: string;
  /** Optional custom inline editor (overrides the generated form). */
  inline?: Editor;
  /** Short summary of the current value for the activities overview. */
  summary?(value: unknown): string;
}

export const activities = new Map<string, ActivityDef>();
export function registerActivity(def: ActivityDef): () => void {
  activities.set(def.id, def);
  return () => activities.delete(def.id);
}
