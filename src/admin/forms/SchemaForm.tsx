/**
 * `SchemaForm` renders an editor tree for any contract schema and validates
 * the value with that same schema on every change.
 */
import { useMemo, useState } from 'react';
import type { z } from 'zod';
import { useAdminLang, useT } from '../i18n';
import { SchemaField, adminRegistry, issueText } from './editors';
import type { EditorRegistry, FormCtx, Suggestion } from './registry';
import { collectIssues, issueMap, pathKey, type FormIssue } from './zod-utils';

export interface SchemaFormProps<T> {
  schema: z.ZodTypeAny;
  value: T;
  onChange(value: T): void;
  registry?: EditorRegistry;
  readOnly?: boolean;
  suggest?: Record<string, Suggestion[]>;
  hidden?: string[];
  /** Show issues (otherwise only after the first change). */
  showIssues?: boolean;
}

export function useValidation(schema: z.ZodTypeAny, value: unknown): FormIssue[] {
  return useMemo(() => collectIssues(schema, value), [schema, value]);
}

export function SchemaForm<T>({ schema, value, onChange, registry, readOnly, suggest, hidden, showIssues }: SchemaFormProps<T>) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  const [touched, setTouched] = useState(false);
  const issues = useValidation(schema, value);
  const ctx: FormCtx = {
    t,
    registry: registry ?? adminRegistry,
    issues: touched || showIssues ? issueMap(issues) : new Map(),
    readOnly,
    suggest,
    lang,
    root: value,
    hidden: new Set(hidden ?? []),
  };
  return (
    <div className="adm-form">
      <SchemaField
        schema={schema}
        value={value}
        path={[]}
        ctx={ctx}
        label=""
        onChange={(v) => {
          setTouched(true);
          onChange(v as T);
        }}
      />
      {(touched || showIssues) && issues.length > 0 && <IssueSummary issues={issues} />}
    </div>
  );
}

export function IssueSummary({ issues }: { issues: readonly FormIssue[] }) {
  const t = useT();
  return (
    <div className="adm-issues" role="status">
      <strong>{t('validation.summary', { count: issues.length })}</strong>
      <ul>
        {issues.slice(0, 20).map((i, n) => (
          <li key={n}>
            <code>{pathKey(i.path) || '—'}</code> {issueText(t, i)}
          </li>
        ))}
      </ul>
    </div>
  );
}
