/** RFC 4180 CSV parse/serialize (quoted fields, "" escapes, CRLF, BOM). */
export function parseCsv(text: string, sep = ','): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: readonly (readonly string[])[]) => rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

/** Rows → objects using the first row as header (lower-cased, trimmed). */
export function csvRecords(text: string): { line: number; rec: Record<string, string> }[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r, i) => ({ line: i + 2, rec: Object.fromEntries(head.map((h, n) => [h, (r[n] ?? '').trim()])) }));
}
