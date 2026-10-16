/** Structural JSON diff (conflict dialog, version diff fallback). */
export interface DiffEntry {
  path: (string | number)[];
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function diffJson(before: unknown, after: unknown, path: (string | number)[] = [], out: DiffEntry[] = []): DiffEntry[] {
  if (before === after) return out;
  if (Array.isArray(before) && Array.isArray(after)) {
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      if (i >= before.length) out.push({ path: [...path, i], kind: 'added', after: after[i] });
      else if (i >= after.length) out.push({ path: [...path, i], kind: 'removed', before: before[i] });
      else diffJson(before[i], after[i], [...path, i], out);
    }
    return out;
  }
  if (isObj(before) && isObj(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(k in before)) out.push({ path: [...path, k], kind: 'added', after: after[k] });
      else if (!(k in after)) out.push({ path: [...path, k], kind: 'removed', before: before[k] });
      else diffJson(before[k], after[k], [...path, k], out);
    }
    return out;
  }
  if (before === undefined) out.push({ path, kind: 'added', after });
  else if (after === undefined) out.push({ path, kind: 'removed', before });
  else out.push({ path, kind: 'changed', before, after });
  return out;
}

export const short = (v: unknown, max = 80): string => {
  if (v === undefined) return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
