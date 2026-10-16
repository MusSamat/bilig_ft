import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConceptPropSchema, ConceptSchema, ItemSchema, LocalizedSchema, SubjectSchema, TopicSchema, type Item } from '@bilig/content-model';
import { builtinRegistry, adminRegistry } from './editors';
import { registerAdminEditors } from './domain-editors';
import { registerPropertyEditor, type EditorProps } from './registry';
import { SchemaForm } from './SchemaForm';
import { collectIssues, defaultFor, setAt, unwrap } from './zod-utils';
import { testI18n } from '../test/utils';

registerAdminEditors();

function Harness<T>({ schema, initial, registry, onValue }: { schema: z.ZodTypeAny; initial: T; registry?: ReturnType<typeof builtinRegistry>; onValue?(v: T): void }) {
  const [v, setV] = useState<T>(initial);
  return (
    <I18nextProvider i18n={testI18n()}>
      <div className="admin-root">
        <SchemaForm schema={schema} value={v} registry={registry} onChange={(nv) => { setV(nv); onValue?.(nv); }} />
        <output data-testid="value">{JSON.stringify(v)}</output>
      </div>
    </I18nextProvider>
  );
}
const value = () => JSON.parse(screen.getByTestId('value').textContent!);

describe('editor registry resolution', () => {
  const r = adminRegistry;
  it('picks structural built-ins', () => {
    expect(r.resolve(z.string(), { path: ['x'], fieldKey: 'x' })?.id).toBe('string');
    expect(r.resolve(z.number().optional(), { path: ['x'], fieldKey: 'x' })?.id).toBe('number');
    expect(r.resolve(z.array(z.string()), { path: ['x'], fieldKey: 'x' })?.id).toBe('tags');
    expect(r.resolve(z.array(z.object({ a: z.string() })), { path: ['x'], fieldKey: 'x' })?.id).toBe('array');
    expect(r.resolve(ItemSchema, { path: [] })?.id).toBe('union');
    expect(r.resolve(z.string().datetime({ offset: true }), { path: ['startsAt'], fieldKey: 'startsAt' })?.id).toBe('datetime');
  });
  it('LocalizedSchema (also optional) gets the 3-language editor', () => {
    expect(r.resolve(LocalizedSchema, { path: ['title'], fieldKey: 'title' })?.id).toBe('localized-schema');
    expect(r.resolve(LocalizedSchema.optional(), { path: ['subtitle'], fieldKey: 'subtitle' })?.id).toBe('localized-schema');
  });
  it('domain editors: by key (hue, icon) and by schema identity (concept props, scene)', () => {
    expect(r.resolve(SubjectSchema.shape.hue, { path: ['hue'], fieldKey: 'hue' })?.id).toBe('key:hue');
    expect(r.resolve(SubjectSchema.shape.icon, { path: ['icon'], fieldKey: 'icon' })?.id).toBe('key:icon');
    expect(r.resolve(ConceptPropSchema, { path: ['props', 0] })?.id).toBe('concept-prop');
    expect(r.resolve(TopicSchema.shape.scene, { path: ['scene'], fieldKey: 'scene' })?.id).toBe('scene');
  });
  it('schema identity beats key, a child registry overrides its parent', () => {
    const child = adminRegistry.child();
    const Custom = () => null;
    child.forSchema(SubjectSchema.shape.hue, Custom, 'my-hue');
    expect(child.resolve(SubjectSchema.shape.hue, { path: ['hue'], fieldKey: 'hue' })?.id).toBe('my-hue');
    expect(adminRegistry.resolve(SubjectSchema.shape.hue, { path: ['hue'], fieldKey: 'hue' })?.id).toBe('key:hue');
  });
});

describe('zod utils', () => {
  it('defaultFor fills required structure with empty values', () => {
    const d = defaultFor(ConceptSchema) as Record<string, unknown>;
    expect(d.title).toEqual({ ky: '', ru: '', en: '' });
    expect(d.props).toEqual([]);
    expect((d.examples as { stem: unknown[] }).stem).toHaveLength(1);
    expect('subtitle' in d).toBe(false);
  });
  it('unwrap peels optional/effects', () => {
    expect(unwrap(LocalizedSchema.optional()).optional).toBe(true);
    expect(unwrap(LocalizedSchema).base).toBeInstanceOf(z.ZodObject);
  });
  it('setAt is immutable and deletes on undefined', () => {
    const a = { x: { y: 1, z: 2 } };
    const b = setAt(a, ['x', 'y'], undefined);
    expect(b).toEqual({ x: { z: 2 } });
    expect(a.x.y).toBe(1);
  });
  it('collectIssues maps missing values to `required`', () => {
    const issues = collectIssues(z.object({ a: z.string() }), {});
    expect(issues[0]).toMatchObject({ path: ['a'], code: 'required' });
  });
});

describe('SchemaForm', () => {
  it('renders the discriminated union of the 5 item types and switches variant fields', () => {
    const initial = defaultFor(ItemSchema) as Item;
    render(<Harness schema={ItemSchema} initial={initial} />);
    const typeSelect = screen.getByLabelText('Тип') as HTMLSelectElement;
    expect([...typeSelect.options].map((o) => o.value)).toEqual(['single', 'multiple', 'match', 'find-on-model', 'numeric']);
    fireEvent.change(typeSelect, { target: { value: 'numeric' } });
    expect(screen.getByLabelText('Допуск')).toBeInTheDocument();
    expect(value().type).toBe('numeric');
    fireEvent.change(typeSelect, { target: { value: 'find-on-model' } });
    expect(screen.getByLabelText('Найти на модели')).toBeInTheDocument();
    expect(screen.queryByLabelText('Допуск')).toBeNull();
  });

  it('validates with the contract schema and shows localized messages', () => {
    render(<Harness schema={SubjectSchema} initial={defaultFor(SubjectSchema)} />);
    fireEvent.change(screen.getByLabelText('Порядок'), { target: { value: '2' } });
    // key is '' → regex fails, title is empty → «заполните хотя бы один язык»
    expect(screen.getAllByText(/Ключ: строчные латинские/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Заполните хотя бы один язык').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Ключ'), { target: { value: 'bio' } });
    expect(value().key).toBe('bio');
  });

  it('hue editor shows light/dark previews with AA checks', () => {
    render(<Harness schema={SubjectSchema} initial={{ ...(defaultFor(SubjectSchema) as object), hue: 140 }} />);
    expect(screen.getByText('Светлая тема')).toBeInTheDocument();
    expect(screen.getByText('Тёмная тема')).toBeInTheDocument();
    expect(screen.getAllByText(/^AA \(≥/).length).toBe(10);
  });

  it('a new property type registers its own editor without touching the form', () => {
    function MolarMass({ value, onChange }: { value: unknown; onChange(v: unknown): void }) {
      const p = value as { value: number };
      return <input aria-label="molar-mass-editor" value={p.value} onChange={(e) => onChange({ ...p, value: Number(e.target.value) })} />;
    }
    const off = registerPropertyEditor('molarMass', MolarMass);
    try {
      render(<Harness schema={z.object({ props: z.array(ConceptPropSchema) })} initial={{ props: [{ kind: 'quantity', type: 'molarMass', value: 18 }] }} />);
      fireEvent.change(screen.getByLabelText('molar-mass-editor'), { target: { value: '18.015' } });
      expect(value().props[0].value).toBe(18.015);
    } finally {
      off();
    }
  });

  it('a registered variant editor replaces generated fields for that variant', () => {
    const reg = adminRegistry.child();
    reg.forVariant(ItemSchema, 'numeric', ({ value, onChange }: EditorProps<Record<string, unknown>>) => (
      <button type="button" onClick={() => onChange({ ...value, answer: 42 })}>
        custom-numeric
      </button>
    ));
    render(<Harness schema={ItemSchema} registry={reg} initial={{ ...(defaultFor(ItemSchema) as object), type: 'numeric', answer: 0, tolerance: 0 }} />);
    fireEvent.click(screen.getByText('custom-numeric'));
    expect(value().answer).toBe(42);
  });

  it('concept property: the dictionary type decides the value kind', () => {
    render(<Harness schema={z.object({ props: z.array(ConceptPropSchema) })} initial={{ props: [{ kind: 'text', type: 'function', value: { ky: '', ru: '', en: '' } }] }} />);
    const typeInput = screen.getAllByLabelText('Тип')[0];
    fireEvent.change(typeInput, { target: { value: 'molarMass' } });
    expect(value().props[0]).toEqual({ kind: 'quantity', type: 'molarMass', value: 0 });
  });
});
